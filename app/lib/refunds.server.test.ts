import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("~/db", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        const value = Reflect.get(testDb, prop);
        return typeof value === "function" ? value.bind(testDb) : value;
      },
    }
  ),
}));

let mockUserId: number | null = null;
vi.mock("~/lib/session", () => ({
  getCurrentUserId: vi.fn(async () => mockUserId),
}));

import { getRefundability } from "./refunds.server";
import { action } from "~/routes/courses.$slug.refund-request";

const PURCHASED_AT = new Date(2026, 10, 2, 23, 0);
const DAY_AFTER = new Date(2026, 10, 3, 12, 0);

let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  mockUserId = base.user.id;

  testDb
    .update(schema.courses)
    .set({ price: 10000 })
    .run();

  const courseModule = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module 1", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3, 4].map(
    (position) =>
      testDb
        .insert(schema.lessons)
        .values({
          moduleId: courseModule.id,
          title: `Lesson ${position}`,
          position,
        })
        .returning()
        .get().id
  );
});

function buy(amountPaid = 10000) {
  return testDb
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid,
      country: "US",
      createdAt: PURCHASED_AT.toISOString(),
    })
    .returning()
    .get();
}

function completeLessons(count: number) {
  for (const lessonId of lessonIds.slice(0, count)) {
    testDb
      .insert(schema.lessonProgress)
      .values({
        userId: base.user.id,
        lessonId,
        status: schema.LessonProgressStatus.Completed,
        completedAt: DAY_AFTER.toISOString(),
      })
      .run();
  }
}

function watch(lessonId: number, positionSeconds: number) {
  testDb
    .insert(schema.videoWatchEvents)
    .values({
      userId: base.user.id,
      lessonId,
      eventType: "progress",
      positionSeconds,
    })
    .run();
}

describe("getRefundability", () => {
  it("is Refundable just after purchase", () => {
    const purchase = buy();
    expect(getRefundability(base.user.id, base.course.id, DAY_AFTER)).toEqual({
      refundable: true,
      purchaseId: purchase.id,
      refundAmount: 10000,
      lastDayInWindow: "2026-11-16",
    });
  });

  it("needs a purchase", () => {
    expect(
      getRefundability(base.user.id, base.course.id, DAY_AFTER)
    ).toMatchObject({ refundable: false, reason: "no-purchase" });
  });

  it("quotes what was paid, not the course's current price", () => {
    buy(3000);
    testDb.update(schema.courses).set({ price: 20000 }).run();
    expect(
      getRefundability(base.user.id, base.course.id, DAY_AFTER)
    ).toMatchObject({ refundable: true, refundAmount: 3000 });
  });

  it("quotes every seat of a team licence, not one", () => {
    buy(5 * 10000);
    expect(
      getRefundability(base.user.id, base.course.id, DAY_AFTER)
    ).toMatchObject({ refundable: true, refundAmount: 50000 });
  });

  it("stays open through the whole fourteenth day after purchase", () => {
    buy();
    expect(
      getRefundability(base.user.id, base.course.id, new Date(2026, 10, 16, 23, 59))
    ).toMatchObject({ refundable: true });
    expect(
      getRefundability(base.user.id, base.course.id, new Date(2026, 10, 17, 0, 1))
    ).toMatchObject({ refundable: false, reason: "window-closed" });
  });

  it("is not Refundable at half the lessons completed", () => {
    buy();
    completeLessons(1);
    expect(
      getRefundability(base.user.id, base.course.id, DAY_AFTER)
    ).toMatchObject({ refundable: true });

    completeLessons(2);
    expect(
      getRefundability(base.user.id, base.course.id, DAY_AFTER)
    ).toMatchObject({ refundable: false, reason: "completion-limit" });
  });

  it("is not Refundable at two hours watched", () => {
    buy();
    watch(lessonIds[0], 3600);
    watch(lessonIds[1], 3599);
    expect(
      getRefundability(base.user.id, base.course.id, DAY_AFTER)
    ).toMatchObject({ refundable: true });

    watch(lessonIds[1], 3600);
    expect(
      getRefundability(base.user.id, base.course.id, DAY_AFTER)
    ).toMatchObject({ refundable: false, reason: "watch-limit" });
  });

  it("is not Refundable once a team seat is claimed", () => {
    const purchase = buy();
    const team = testDb.insert(schema.teams).values({}).returning().get();
    testDb
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "SEAT-1",
        purchaseId: purchase.id,
        redeemedByUserId: base.instructor.id,
        redeemedAt: DAY_AFTER.toISOString(),
      })
      .run();
    expect(
      getRefundability(base.user.id, base.course.id, DAY_AFTER)
    ).toMatchObject({ refundable: false, reason: "claimed-seat" });
  });

  it("is not Refundable while a request is already Requested", () => {
    const purchase = buy();
    testDb
      .insert(schema.refundRequests)
      .values({ purchaseId: purchase.id, reason: "Not what I expected." })
      .run();
    expect(
      getRefundability(base.user.id, base.course.id, DAY_AFTER)
    ).toMatchObject({ refundable: false, reason: "already-requested" });
  });
});

describe("refund-request action", () => {
  function submit() {
    const body = new FormData();
    body.set("reason", "The videos in module 3 will not play for me.");
    return action({
      params: { slug: base.course.slug },
      request: new Request("http://localhost/courses/test-course/refund-request", {
        method: "POST",
        body,
      }),
    } as Parameters<typeof action>[0]);
  }

  async function rejection(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      return error as { init: { status: number }; data: string };
    }
    throw new Error("Expected the action to throw");
  }

  it("creates the request for a Refundable purchase", async () => {
    const purchase = testDb
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 10000,
        country: "US",
      })
      .returning()
      .get();
    vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await submit();

    expect(response).toBeInstanceOf(Response);
    const requests = testDb.select().from(schema.refundRequests).all();
    expect(requests).toHaveLength(1);
    expect(requests[0].purchaseId).toBe(purchase.id);
  });

  it("rejects a learner past the completion limit", async () => {
    testDb
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 10000,
        country: "US",
      })
      .run();
    completeLessons(2);

    const error = await rejection(submit());

    expect(error.init.status).toBe(403);
    expect(error.data).toMatch(/completed too much/);
    expect(testDb.select().from(schema.refundRequests).all()).toHaveLength(0);
  });
});

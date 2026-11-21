import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  purchases,
  refundRequests,
  RefundRequestStatus,
  videoWatchEvents,
} from "~/db/schema";

// ─── Refundable ───
// The one place that decides whether a learner's Purchase is Refundable. The
// course page uses it to decide whether to offer a refund, and the
// refund-request action uses it again before creating the request, so the two
// can never disagree.

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

export type NotRefundableReason =
  | "no-purchase"
  | "already-requested"
  | "claimed-seat"
  | "window-closed"
  | "completion-limit"
  | "watch-limit";

export type Refundability =
  | {
      refundable: true;
      purchaseId: number;
      refundAmount: number;
      lastDayInWindow: string;
    }
  | { refundable: false; reason: NotRefundableReason };

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function hasRequestedRefundRequest(purchaseId: number) {
  return !!db
    .select({ id: refundRequests.id })
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.purchaseId, purchaseId),
        eq(refundRequests.status, RefundRequestStatus.Requested)
      )
    )
    .get();
}

// A seat that came out of a team licence, and has been claimed, belongs to
// the team — the purchase cannot be refunded on its own.
function hasClaimedSeat(purchaseId: number) {
  return !!db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt))
    )
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

function getSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

// The Refund window is counted in whole days, not hours — someone who buys at
// 23:00 should still get the whole of their fourteenth day.
function calendarDay(when: Date): string {
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function lastDayOfWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

/**
 * Whether the learner's latest Purchase of the course is Refundable right now,
 * and if so, what the Refund amount would be.
 *
 * The Refund amount is exactly what was paid for the Purchase, whatever the
 * course's price is now. For a team licence that is the price of every seat.
 */
export function getRefundability(
  userId: number,
  courseId: number,
  now: Date = new Date()
): Refundability {
  const purchase = getLatestPurchase(userId, courseId);
  if (!purchase) return { refundable: false, reason: "no-purchase" };

  if (hasRequestedRefundRequest(purchase.id)) {
    return { refundable: false, reason: "already-requested" };
  }

  if (hasClaimedSeat(purchase.id)) {
    return { refundable: false, reason: "claimed-seat" };
  }

  const lastDayInWindow = lastDayOfWindow(purchase.createdAt);
  const today = calendarDay(now);
  const isWithinWindow =
    today >= calendarDay(new Date(purchase.createdAt)) &&
    today <= lastDayInWindow;

  if (!isWithinWindow) return { refundable: false, reason: "window-closed" };

  const lessonIds = getLessonIdsForCourse(courseId);

  if (lessonIds.length > 0) {
    const completedCount = getCompletedLessonCount(userId, lessonIds);
    if (completedCount / lessonIds.length >= REFUND_COMPLETION_LIMIT) {
      return { refundable: false, reason: "completion-limit" };
    }
  }

  if (getSecondsWatched(userId, lessonIds) >= REFUND_WATCH_LIMIT_SECONDS) {
    return { refundable: false, reason: "watch-limit" };
  }

  return {
    refundable: true,
    purchaseId: purchase.id,
    refundAmount: purchase.amountPaid,
    lastDayInWindow,
  };
}

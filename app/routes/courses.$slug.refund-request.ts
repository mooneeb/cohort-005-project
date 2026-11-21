import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund-request";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import {
  courses,
  refundRequests,
  users,
  RefundRequestStatus,
} from "~/db/schema";
import { eq } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import {
  getRefundability,
  REFUND_WINDOW_DAYS,
  type NotRefundableReason,
} from "~/lib/refunds.server";

const refundRequestParamsSchema = z.object({
  slug: z.string().min(1),
});

const refundRequestActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you want a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

function getCourseBySlug(slug: string) {
  return db.select().from(courses).where(eq(courses.slug, slug)).get();
}

const notRefundable: Record<
  NotRefundableReason,
  { message: string; status: number }
> = {
  "no-purchase": { message: "You have not bought this course.", status: 403 },
  "already-requested": {
    message: "You already have a refund request for this purchase.",
    status: 409,
  },
  "claimed-seat": {
    message: "This purchase is no longer refundable: it is a claimed team seat.",
    status: 403,
  },
  "window-closed": {
    message: `This purchase is no longer refundable: the ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
    status: 403,
  },
  "completion-limit": {
    message:
      "This purchase is no longer refundable: you have completed too much of this course.",
    status: 403,
  },
  "watch-limit": {
    message:
      "This purchase is no longer refundable: you have watched too much of this course.",
    status: 403,
  },
};

/**
 * The confirmation the learner gets in their inbox. There is no mail
 * transport wired up yet, so the built message goes to the server log.
 */
function buildRefundRequestedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  refundAmount: number;
}) {
  return {
    to: input.learnerEmail,
    subject: `Refund requested — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have your refund request for "${input.courseTitle}".`,
      `The refund is for ${formatPrice(input.refundAmount)}, the amount you paid.`,
      "",
      "The Cadence team reviews every refund request by hand. You do not need to do anything else — we will email you again when it is done.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to request a refund.", { status: 401 });
  }

  const { slug } = parseParams(params, refundRequestParamsSchema);
  const course = getCourseBySlug(slug);

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const learner = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!learner) {
    throw data("User not found", { status: 404 });
  }

  const refundability = getRefundability(currentUserId, course.id);

  if (!refundability.refundable) {
    const { message, status } = notRefundable[refundability.reason];
    throw data(message, { status });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundRequestActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  db.insert(refundRequests)
    .values({
      purchaseId: refundability.purchaseId,
      status: RefundRequestStatus.Requested,
      reason: parsed.data.reason,
    })
    .returning()
    .get();

  const email = buildRefundRequestedEmail({
    learnerName: learner.name,
    learnerEmail: learner.email,
    courseTitle: course.title,
    refundAmount: refundability.refundAmount,
  });

  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);

  return redirect("/settings");
}

# Cadence

Cadence is a course platform. Learners buy courses and work through them, and instructors build and sell them.

## Language

### Buying and refunds

**Purchase**:
A learner's payment for one course, which gives them access to it.
_Avoid_: Order, transaction

**Refund request**:
A learner's request, with a reason, for their money back on a Purchase. It is Requested until an Admin Approves or Declines it. A Purchase can have at most two Refund requests: after a first Decline the learner may ask once more, if the Purchase is still Refundable. A second Decline ends it.
_Avoid_: Cancellation, Reversal, Chargeback, open/pending refund

**Resolved**:
Describes a Refund request that has been Approved or Declined. Only the Admin it is Assigned to can resolve it. It is an internal term and never appears in learner-facing copy. An Admin may later Approve a Declined request, but an Approved request never changes.
_Avoid_: Rejected (for either Approved or Declined)

**Assigned**:
Describes a Requested Refund request that one Admin has taken on. Any Admin may take it over or release it back to the unassigned pool.
_Avoid_: Claimed, locked

**Refund**:
The money returned to a learner when their Refund request is Approved. A learner who has received one is Refunded. Approval also ends the learner's access to the course at once, without waiting for the money to move. Their progress in the course is kept for 180 days after Approval, then deleted.
_Avoid_: Reversal, Chargeback

**Refund window**:
The 14 calendar days after a Purchase, counting the day of purchase, during which a Refund can be requested.
_Avoid_: Cancel window, cancellation period

**Refundable**:
Describes a Purchase that is inside its Refund window, under the watch-time and completion limits, and not a claimed team seat.
_Avoid_: Cancellable, eligible for cancellation

**Refund amount**:
The money a Refund returns: exactly what was paid for the Purchase, whatever the course's price is now. It is fixed when the Refund request is made.
_Avoid_: Refundable amount, reversal amount

**Admin**:
A member of Cadence staff, the role that Approves or Declines Refund requests. Learner-facing copy calls them "the Cadence team".
_Avoid_: Team admin (see Team owner)

**Team owner**:
The person who bought a Purchase of seats for their team and hands the seats out. They are not an Admin and are not enrolled through that Purchase themselves.
_Avoid_: Team admin

**Chargeback**:
A dispute the cardholder raises with their bank, which bypasses Cadence entirely. It is never a Refund. The term is reserved even though it is not modelled yet.

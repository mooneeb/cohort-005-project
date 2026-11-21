# Keep a refunded learner's progress for 180 days, then delete it

When a Refund request is Approved, the learner's access ends at once. Their progress (lesson completions, watch history, quiz attempts) is kept for 180 days after Approval and then deleted. We keep it because it is our evidence if the learner later raises a Chargeback, and card networks commonly allow disputes for about 120 days. We delete it after that because once they are no longer a customer, we have no reason to hold their activity. Only the activity is deleted. The Purchase, the Refund requests (including the progress recorded on each one) and the ended enrollment are business records and are kept, so counts of purchases, Refunds and Declines survive the purge.

## Considered Options

- **Delete progress at Approval**: rejected. It is irreversible and destroys the Chargeback evidence just when it may be needed.
- **Keep progress indefinitely**: rejected. It holds a non-customer's activity with no purpose once the dispute window has passed.

## Consequences

- The purge needs a scheduled job, which the app does not have yet. It is tracked as a separate follow-up issue, so until it ships progress is in practice kept indefinitely.
- A learner who buys the course again after the purge starts from zero.

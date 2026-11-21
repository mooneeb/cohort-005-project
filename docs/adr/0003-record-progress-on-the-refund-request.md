# Record the learner's progress on the Refund request when it is made

Each Refund request stores the learner's watch time and share of lessons completed as they were when the request was made, even though both look derivable from the activity tables. They are not derivable: the learner keeps watching while the request is Requested, so live figures cannot show what they had used when they asked. After the 180-day purge (ADR-0001) the activity is gone, which leaves this snapshot as the only lasting record of how much a Refunded learner had used. Do not replace these columns with a query over the activity tables.

## Considered Options

- **Compute progress live when an Admin opens the request**: rejected. It shows what the learner has used now, not what they had used when they asked, and it stops working once the purge has run.

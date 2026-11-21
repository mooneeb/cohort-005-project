# End an enrollment with a marker instead of deleting it

When a Refund request is Approved, the learner's enrollment is marked as ended rather than deleted, and access means "has an enrollment that has not ended". Deleting the row would be simpler, because access already depends on whether the row exists. But it would erase when the learner enrolled and whether they completed, and that history feeds the dashboard, instructor analytics and Refund statistics.

## Consequences

- Every query that treats an enrollment as current access or a current student must exclude ended enrollments. Today none of them do (`app/lib/access.server.ts`, the purchase and redeem routes, the dashboard, instructor analytics). Missing one quietly gives a Refunded learner their access back or keeps them counted as a student.
- Buying again is blocked: the purchase route refuses anyone who has an enrollment, ended or not. Allowing a re-purchase means reactivating the ended enrollment rather than inserting a new one. That is out of scope for now.

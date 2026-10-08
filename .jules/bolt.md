## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## 2024-03-22 - [Prisma Field Comparison Filtering]
**Learning:** Using Prisma's `.fields` comparison (e.g., `attemptCount: { lt: prisma.agentExecution.fields.maxAttempts }`) enables pushing cross-column validations directly to the database instead of loading records into the application memory and filtering them in Javascript. However, `apps/api/test/mockPrisma.ts` needs to be customized to mock this feature since it does not support it natively.
**Action:** When filtering objects based on the value of another field on the same row, prefer Prisma's field comparison feature instead of post-processing the query results.

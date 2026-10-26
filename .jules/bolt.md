## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## 2024-10-26 - [Prisma Native Column Comparison Optimization]
**Learning:** Filtering records in memory using JS arrays can cause a significant performance bottleneck by forcing the API to fetch thousands of unnecessary rows into memory. Prisma supports native column comparisons (e.g. `this.prisma.agentExecution.fields.maxAttempts`) which allows pushing this logic directly down to the database engine.
**Action:** When comparing two columns on the same table (like `attemptCount < maxAttempts`), use Prisma's `.fields` property inside the `where` clause instead of `.filter()`ing in memory. Ensure to update `apps/api/test/mockPrisma.ts` accordingly.

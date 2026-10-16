## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## 2024-10-16 - [Prisma Native Column Comparison Optimization]
**Learning:** Fetching data from the database and filtering it in memory (e.g., comparing `attemptCount < maxAttempts` in JS) causes unnecessary data transfer and memory usage, especially for background workers processing large queues. Prisma supports pushing these column-to-column comparisons directly to the database using the `model.fields.fieldName` syntax.
**Action:** Whenever comparing two columns of the same table in a where clause, always use Prisma's `model.fields` for native database comparison rather than fetching and filtering in the application layer. Remember to update Prisma mocks to support the `fields` object.

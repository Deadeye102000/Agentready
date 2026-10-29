## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## 2024-10-29 - [Prisma Native Column Comparison Optimization]
**Learning:** Filtering arrays in application memory (`candidates.filter(...)`) for conditions that could be evaluated by the database (like comparing two columns: `attemptCount < maxAttempts`) wastes memory and database bandwidth by unnecessarily transferring unneeded records. Prisma supports native column comparisons directly in the query using `.fields` (e.g., `attemptCount: { lt: prisma.agentExecution.fields.maxAttempts }`).
**Action:** Always push column-to-column comparisons down to the database using Prisma's `.fields` property instead of fetching records and filtering them in Node.js, ensuring smaller result sets and reducing application processing overhead.

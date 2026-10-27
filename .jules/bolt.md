## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## 2024-03-21 - [Prisma Native Column Comparison]
**Learning:** Filtering rows by comparing two columns on the same record used to require raw SQL in Prisma. However, since Prisma v5, it supports native field reference comparisons (e.g. `attemptCount: { lt: prisma.model.fields.maxAttempts }`). Doing this pushes the filter down to the database level, preventing memory issues from fetching all matching records and filtering application-side.
**Action:** Always prefer pushing intra-record column comparisons to the database using `prisma.modelName.fields.fieldName` rather than fetching and filtering via array methods like `.filter()`. Ensure these features are mocked in `mockPrisma.ts` using object property checks.

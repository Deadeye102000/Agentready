## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## 2024-10-13 - [Prisma Native Column Comparison]
**Learning:** Using Prisma's native column comparison (`model.fields.fieldName`) pushes filtering logic down to the database level, which significantly reduces data transfer and memory overhead compared to fetching records and filtering them in the application layer. However, this functionality must be explicitly supported in tests that use `mockPrisma` to prevent failures.
**Action:** When filtering records based on two columns in the same table, prefer Prisma native column comparisons (`.fields`) to push the logic to the database layer. Always ensure `mockPrisma` is updated to handle this structured comparison syntax.

## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## 2024-03-21 - [Prisma Existence Check Optimization]
**Learning:** For Prisma database queries, using \`.count()\` for existence checks forces the database to scan all matches or the entire index to compute the full count.
**Action:** When checking if a record exists (e.g., in tenancy/authorization middleware), prefer \`.findFirst({ select: { id: true } }) !== null\` over \`.count() > 0\` or \`.count() === 1\`. This allows the DB to return immediately upon finding the first match, drastically reducing query latency and DB load, especially on large tables.

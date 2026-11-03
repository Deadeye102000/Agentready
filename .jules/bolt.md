## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## 2024-05-18 - [Prisma Existence Check Optimization]
**Learning:** For Prisma database queries, using `.count()` for simple existence checks forces the database to perform a full scan or count aggregation of matching rows, which is unnecessary and slow when only trying to verify if *any* matching row exists.
**Action:** When performing existence checks in Prisma, prefer using `.findFirst({ select: { id: true } }) !== null` over `.count() === 1` or `.count() > 0` to optimize performance by allowing the database to return immediately upon finding the first match.

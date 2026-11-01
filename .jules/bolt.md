## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.
## 2024-11-01 - Prisma Native Count Optimization
**Learning:** Checking existence in Prisma using `.count()` and comparing it to 1 is less performant than using `.findFirst()` with a `select: { id: true }` because `.count()` requires scanning rows while `.findFirst()` can stop immediately upon finding the first match.
**Action:** Replace `.count()` with `.findFirst({ select: { id: true } })` followed by checking if the result is not null for boolean existence checks.

## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.
## 2026-11-06 - [Prisma findFirst Optimization]
**Learning:** Using `.findFirst({ select: { id: true } }) !== null` for existence checks is significantly faster than `.count() === 1`, as it allows the database to short-circuit instead of scanning all matching rows.
**Action:** Always prefer `findFirst` for existence checks instead of `count` across the codebase.

## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## 2025-02-14 - Prisma Existence Checks Optimization
**Learning:** Using `.findFirst({ select: { id: true } }) !== null` is a better pattern for existence checks than `.count() === 1` or `.count() > 0`. This is because `.findFirst` allows the database to return immediately upon finding the first match, whereas `.count()` forces the database engine to scan all matching rows (even though it's typically constrained by indexes, avoiding full aggregation is more efficient in many DB engines).
**Action:** When verifying record existence in Prisma without needing the full record or the total count, prefer the `.findFirst({ select: { id: true } }) !== null` pattern.

## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## $(date +%Y-%m-%d) - Optimize Prisma Existence Checks
**Learning:** Checking for existence in Prisma using `.count({ where: ... }) === 1` performs a full table scan or index scan to count all matching rows.
**Action:** Always prefer `.findFirst({ where: ..., select: { id: true } }) !== null` to allow the database to immediately return true upon finding the first match, resulting in faster queries and reduced database load. Ensure that corresponding `findFirst` methods are added to the mock Prisma implementation (`mockPrisma.ts`) when refactoring from `count`.

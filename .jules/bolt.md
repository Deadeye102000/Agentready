## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## 2026-10-31 - [Prisma Count vs FindFirst Existence Check]
**Learning:** When using Prisma, .count() performs a full count query which can be slow. Changing to .findFirst({ select: { id: true } }) !== null is faster for simple existence checks. However, when making this change, ensure all mock Prisma configurations (e.g. apps/api/test/mockPrisma.ts) are updated to include .findFirst for the affected models, otherwise tests will fall through and fail.
**Action:** Use .findFirst({ select: { id: true } }) for existence checks in Prisma, and always verify and update corresponding test mocks.

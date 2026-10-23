## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.
## 2026-10-23 - [Fix N+1 in EvalRunService]
**Learning:** Found an N+1 query loop when fetching EvalCase records within `getRegressionReport`. The codebase queries the database repeatedly inside the loop instead of doing a batch fetch.
**Action:** Replaced the loop query `await this.prisma.evalCase.findFirst` with a single batch fetch using `this.prisma.evalCase.findMany({ where: { id: { in: caseIds } } })` to resolve the N+1 bottleneck.

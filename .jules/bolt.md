## 2026-09-19 - Avoid N+1 Queries in Prisma Loops
**Learning:** Looping over records and executing a `.findFirst()` or `.findUnique()` inside the loop for related data causes severe N+1 query bottlenecks, especially during regression reports that evaluate multiple test cases.
**Action:** Always pre-fetch related records outside the loop using `.findMany({ where: { id: { in: ids } } })` and map them in memory for O(1) lookups inside the loop.

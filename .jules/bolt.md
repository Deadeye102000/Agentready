## 2024-05-18 - Optimized feature flag retrieval N+1 queries in GovernanceRepository
**Learning:** Sequential and parallelized `findFirst` fallback queries on Prisma create N+1 query patterns that add unnecessary DB load to hot execution paths like `checkToolCall`. Prisma translates an array matching `OR` condition using `agentId: { in: agentIdList }` into an efficient batched `findMany`.
**Action:** Replace sequential or parallelized `findFirst` fallback queries with a batched `findMany` combined with application-side merging. This significantly reduces DB load in hot execution paths.

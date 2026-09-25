## 2025-01-21 - Push filter to DB layer using Prisma `.fields`

**Learning:** When using Prisma to perform queries involving comparisons between fields in the same row, you can use `.fields` to instruct the DB to evaluate the condition natively, removing the need for an application-side `filter()`. But this must also be replicated into the tests that use a mocked database layer to prevent query validation/test failures since mocks won't automatically implement `.fields` evaluation.

**Action:** Replace `Array.prototype.filter()` loops that filter results based on DB fields with Prisma native property `.fields` conditions (e.g. `attemptCount: { lt: prisma.model.fields.maxAttempts }`). And if tests use `mockPrisma`, implement evaluation of these field comparisons manually in the mock `mockPrisma.model.findMany`.

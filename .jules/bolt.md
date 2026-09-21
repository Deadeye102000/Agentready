## 2025-02-19 - [Pushing Attempt Filtering to the DB]
**Learning:** Prisma v5+ supports native column comparisons in query filters using `fields.<fieldName>`. Previously, `agentExecution` retry logic fetched failed queries and filtered application-side (`attemptCount < maxAttempts`).
**Action:** Always prefer pushing column comparisons directly to the SQL database using Prisma's `.fields` property to eliminate application-side filtering overhead and improve efficiency at scale.

## 2024-03-20 - [Prisma Multiple Counts Optimization]
**Learning:** For Prisma database queries, executing multiple separate `count()` calls on the same table with different conditions causes unnecessary database roundtrips. Prisma's `groupBy` feature can calculate metrics for all statuses in a single query, significantly reducing latency and connection pool overhead.
**Action:** When a dashboard or aggregate view requires counts grouped by categorical fields (like `status`), always use a single `groupBy` combined with application-level reduction rather than issuing separate `count()` queries per status.

## 2026-10-30 - [Prisma Native Column Comparison]
**Learning:** For database filtering comparing two columns in the same table, filtering application side causes all items to be retrieved from the DB which causes unnecessary latency and bandwidth waste. Prisma supports native column comparison natively via the `.fields` API for more optimal queries.
**Action:** Use native column comparison via `.fields` property (e.g., `model.fields.fieldName`) rather than application-side filters.

-- Migration: audit_log_restrict_org_delete
--
-- Policy change: AuditLog records are compliance evidence. An Organization
-- with existing AuditLog rows CANNOT be deleted — the FK constraint is changed
-- from CASCADE (silently erases evidence) to RESTRICT (blocks deletion,
-- requiring explicit archival/export first).
--
-- This enforces the Human Governance Invariant at the database level:
-- neither agents nor administrators can erase their own audit trail by
-- deleting the parent organization.
--
-- To delete an organization that has audit logs, an operator must first
-- bulk-delete or archive the AuditLog rows through an explicit, audited
-- offboarding procedure (future work: org archival API endpoint).

-- Drop the existing FK constraint (CASCADE) and replace with RESTRICT.
ALTER TABLE "AuditLog"
  DROP CONSTRAINT "AuditLog_organizationId_fkey";

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

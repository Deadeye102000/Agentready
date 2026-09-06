-- Revoke UPDATE and DELETE permissions on the AuditLog table
REVOKE UPDATE, DELETE ON "AuditLog" FROM PUBLIC;

-- Create an immutable audit log trigger to guarantee immutability even for the table owner/superuser
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- Direct client operations have trigger depth <= 1; foreign key actions (e.g. ON DELETE SET NULL / CASCADE) have depth > 1
    IF pg_trigger_depth() <= 1 THEN
        IF TG_OP = 'UPDATE' THEN
            RAISE EXCEPTION 'AuditLog records are immutable. Direct UPDATE operations are prohibited.';
        ELSIF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'AuditLog records are immutable. Direct DELETE operations are prohibited.';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_modification ON "AuditLog";
CREATE TRIGGER trg_prevent_audit_log_modification
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();

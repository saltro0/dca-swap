-- RLS: Users can only read their own audit logs
ALTER TABLE dca_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit logs"
  ON dca_audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy for authenticated users.
-- Server-side inserts use the service role key which bypasses RLS by default.
-- This makes the audit log immutable from the client side.

-- CHECK constraint on result
ALTER TABLE dca_audit_log
  ADD CONSTRAINT dca_audit_log_result_check
  CHECK (result IN ('pending', 'success', 'failed'));

-- CHECK constraint on op_type
ALTER TABLE dca_audit_log
  ADD CONSTRAINT dca_audit_log_op_type_check
  CHECK (op_type IN (
    'account_create',
    'dca_create',
    'dca_stop',
    'dca_withdraw',
    'dca_topup',
    'gas_deposit',
    'gas_withdraw',
    'unwrap_whbar',
    'transfer',
    'token_association',
    'token_approval',
    'key_rotation'
  ));

-- Index for fast user-scoped queries
CREATE INDEX IF NOT EXISTS idx_dca_audit_log_user_created
  ON dca_audit_log (user_id, created_at DESC);

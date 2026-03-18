import { getAdminSupabase, DB } from '@/lib/supabase/admin'
import type { Json } from '@/types/supabase'
import type { OperationType } from '@/types'

interface AuditContext {
  userId: string
  vaultKeyId: string
  ip: string | null
}

/**
 * Record an operation in the audit log.
 * Always .catch() on success paths — audit failure must never break user flow.
 */
export async function recordAuditLog(
  ctx: AuditContext,
  opType: OperationType,
  opParams: Record<string, unknown>,
  result: { txHash?: string; error?: string }
): Promise<void> {
  const supabase = getAdminSupabase()

  const { error: insertError } = await supabase.from(DB.AUDIT_LOG).insert({
    user_id: ctx.userId,
    vault_key_id: ctx.vaultKeyId,
    op_type: opType,
    op_params: opParams as unknown as Json,
    tx_hash: result.txHash ?? null,
    result: result.error ? 'failed' : 'success',
    error_detail: result.error ?? null,
    client_ip: ctx.ip,
  })

  if (insertError) {
    console.error('[audit] Failed to insert audit log:', insertError)
  }
}

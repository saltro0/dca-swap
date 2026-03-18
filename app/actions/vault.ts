'use server'

import { requireUser, extractClientIp } from '@/lib/utils/guards'
import { getAdminSupabase, DB } from '@/lib/supabase/admin'
import { vault } from '@/lib/services/vault-service'
import { ledger } from '@/lib/services/ledger-service'
import { recordAuditLog } from '@/lib/utils/audit'
import type { AccountSummary } from '@/types'

/**
 * Provision a new custodial Hedera account for the current user.
 * Creates KMS key -> Hedera account -> stores in DB.
 */
export async function provisionAccount(): Promise<{
  success: boolean
  account?: AccountSummary
  error?: string
}> {
  let userId: string | undefined
  let vaultKeyId = 'unknown'
  let ip: string | null = null

  try {
    const user = await requireUser()
    userId = user.id
    ip = await extractClientIp()
    const db = getAdminSupabase()

    // Check for existing account
    const { data: existing } = await db
      .from(DB.ACCOUNTS)
      .select('account_id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return { success: false, error: 'Account already exists' }
    }

    // 1. Provision signing key in KMS
    const keyInfo = await vault.provisionSigningKey(user.id)
    vaultKeyId = keyInfo.keyId

    // 2. Open Hedera account
    const accountId = await ledger.openAccount(keyInfo.publicKeyHex)

    // 3. Derive EVM address
    const walletAddress = ledger.deriveAddress(keyInfo.publicKeyHex)

    // 4. Persist account
    const { error: insertErr } = await db.from(DB.ACCOUNTS).insert({
      user_id: user.id,
      account_id: accountId,
      vault_key_id: keyInfo.keyId,
      vault_key_arn: keyInfo.keyArn,
      public_key: keyInfo.publicKeyHex,
      wallet_address: walletAddress,
      is_active: true,
    })

    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`)

    // 5. Initialize rate limits
    await db.from(DB.RATE_LIMITS).insert({ user_id: user.id })

    // 6. Audit log (success)
    await recordAuditLog(
      { userId: user.id, vaultKeyId: keyInfo.keyId, ip },
      'account_create',
      { account_id: accountId },
      {}
    ).catch((err) => console.warn('[audit] insert failed:', err))

    return {
      success: true,
      account: {
        accountId,
        walletAddress,
        publicKey: keyInfo.publicKeyHex,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    }
  } catch (err: any) {
    console.error('[provisionAccount]', err)
    if (userId) {
      await recordAuditLog(
        { userId, vaultKeyId, ip },
        'account_create',
        {},
        { error: err.message }
      ).catch(() => {})
    }
    return { success: false, error: err.message || 'Account creation failed' }
  }
}

/**
 * Fetch the current user's account info.
 */
export async function fetchAccountInfo(): Promise<{
  account: AccountSummary | null
}> {
  try {
    const user = await requireUser()
    const db = getAdminSupabase()

    const { data } = await db
      .from(DB.ACCOUNTS)
      .select('account_id, wallet_address, public_key, is_active, created_at')
      .eq('user_id', user.id)
      .single()

    if (!data) return { account: null }

    return {
      account: {
        accountId: data.account_id,
        walletAddress: data.wallet_address,
        publicKey: data.public_key,
        isActive: data.is_active ?? true,
        createdAt: data.created_at ?? new Date().toISOString(),
      },
    }
  } catch {
    return { account: null }
  }
}

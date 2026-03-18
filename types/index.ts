// Vault (KMS) types
export interface VaultKeyInfo {
  keyId: string
  keyArn: string
  publicKeyHex: string
}

export interface VaultSignResult {
  signature: Uint8Array
}

// Account types
export interface DcaAccount {
  id: string
  userId: string
  accountId: string
  vaultKeyId: string
  vaultKeyArn: string
  publicKey: string
  walletAddress: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AccountSummary {
  accountId: string
  walletAddress: string
  publicKey: string
  isActive: boolean
  createdAt: string
}

// Auth types
export interface SessionUser {
  id: string
  email: string
}

// Audit types
export type OperationType =
  | 'account_create'
  | 'dca_create'
  | 'dca_stop'
  | 'dca_withdraw'
  | 'dca_topup'
  | 'gas_deposit'
  | 'gas_withdraw'
  | 'unwrap_whbar'
  | 'transfer'
  | 'token_association'
  | 'token_approval'
  | 'key_rotation'

export type OperationResult = 'pending' | 'success' | 'failed'

export interface AuditLogEntry {
  id: string
  user_id: string
  vault_key_id: string
  op_type: OperationType
  op_params: Record<string, unknown> | string | number | boolean | null
  result: OperationResult
  tx_hash: string | null
  error_detail: string | null
  client_ip: string | null
  created_at: string
}

export interface AuditLogFilters {
  type?: string
  status?: string
  dateFrom?: string
  dateTo?: string
}

export interface AuditLogPagination {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

// DCA types
export interface DCAPositionOnChain {
  owner: string
  tokenIn: string
  tokenOut: string
  amountPerSwap: bigint
  interval: bigint
  maxExecutions: bigint
  executionsLeft: bigint
  executionsDone: bigint
  tokenInBalance: bigint
  tokenOutAccum: bigint
  hbarBalance: bigint
  slippageBps: number
  active: boolean
  currentSchedule: string
  lastExecutedAt: bigint
  consecutiveFailures: number
}

export interface DCAPositionSummary {
  positionId: number
  tokenIn: string
  tokenOut: string
  tokenInSymbol: string
  tokenOutSymbol: string
  amountPerSwap: string
  interval: number
  executionsLeft: number
  executionsDone: number
  tokenInBalance: string
  tokenOutAccum: string
  lastExecutedAt: number // Unix seconds, 0 if never executed
  status: 'active' | 'stopped' | 'withdrawn' | 'exhausted'
  createdAt: string
}

export interface CreatePositionParams {
  tokenIn: string
  tokenOut: string
  amountPerSwap: string
  tokenInAmount: string
  interval: number
  slippageBps: number
}

export interface DCAExecutionRecord {
  positionId: number
  tokenInSpent: string
  tokenOutReceived: string
  feeAmount: string
  txHash: string
  executedAt: string
}

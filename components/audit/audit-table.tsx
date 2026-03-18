"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, ExternalLink, Loader2 } from "lucide-react";
import type { AuditLogEntry } from "@/types";

const HEDERA_NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || "testnet";
const HASHSCAN_BASE =
  HEDERA_NETWORK === "mainnet"
    ? "https://hashscan.io/mainnet"
    : "https://hashscan.io/testnet";

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  failed: "bg-red-500/15 text-red-400 border-red-500/20",
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
};

const OP_LABELS: Record<string, string> = {
  account_create: "Account Create",
  dca_create: "DCA Create",
  dca_stop: "DCA Stop",
  dca_withdraw: "DCA Withdraw",
  dca_topup: "DCA Top-up",
  gas_deposit: "Gas Deposit",
  gas_withdraw: "Gas Withdraw",
  unwrap_whbar: "Unwrap WHBAR",
};

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-white/5 animate-pulse">
      <div className="w-24 h-4 bg-white/10 rounded" />
      <div className="w-20 h-4 bg-white/10 rounded" />
      <div className="flex-1 h-4 bg-white/10 rounded" />
      <div className="w-16 h-4 bg-white/10 rounded" />
    </div>
  );
}

interface AuditTableProps {
  logs: AuditLogEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function AuditTable({ logs, loading, hasMore, onLoadMore }: AuditTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!loading && logs.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500">
        <p className="text-sm">No operations recorded yet.</p>
        <p className="text-xs mt-1">Your signing activity will appear here.</p>
      </div>
    );
  }

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_120px_100px_140px] gap-2 px-4 py-2.5 bg-white/5 text-xs font-medium text-zinc-400 uppercase tracking-wider">
        <span>Operation</span>
        <span>Status</span>
        <span>Tx</span>
        <span className="text-right">Date</span>
      </div>

      {/* Rows */}
      {loading && logs.length === 0
        ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
        : logs.map((log) => {
            const expanded = expandedId === log.id;
            return (
              <div key={log.id} className="border-b border-white/5 last:border-b-0">
                <button
                  onClick={() => setExpandedId(expanded ? null : log.id)}
                  className="w-full grid grid-cols-[1fr_120px_100px_140px] gap-2 px-4 py-3 text-sm items-center hover:bg-white/[0.03] transition-colors text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {expanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    )}
                    <span className="text-zinc-200">{OP_LABELS[log.op_type] ?? log.op_type}</span>
                  </span>
                  <span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${
                        STATUS_STYLES[log.result] ?? STATUS_STYLES.pending
                      }`}
                    >
                      {log.result}
                    </span>
                  </span>
                  <span>
                    {log.tx_hash ? (
                      <a
                        href={`${HASHSCAN_BASE}/transaction/${log.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[#00f0ff] hover:underline text-xs flex items-center gap-1"
                      >
                        View
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </span>
                  <span className="text-xs text-zinc-400 text-right">
                    {log.created_at ? formatDate(log.created_at) : "—"}
                  </span>
                </button>

                {/* Expanded detail panel */}
                {expanded && (
                  <div className="px-10 pb-4 space-y-2 text-xs">
                    {log.tx_hash && (
                      <div className="flex items-center gap-2 text-zinc-400">
                        <span className="text-zinc-500 w-16 shrink-0">Tx Hash</span>
                        <code className="text-zinc-300 truncate max-w-xs">{log.tx_hash}</code>
                        <button
                          onClick={() => copyToClipboard(log.tx_hash!)}
                          className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-zinc-400">
                      <span className="text-zinc-500 w-16 shrink-0">Key ID</span>
                      <code className="text-zinc-300 truncate max-w-xs">{log.vault_key_id}</code>
                      <button
                        onClick={() => copyToClipboard(log.vault_key_id)}
                        className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    {log.client_ip && (
                      <div className="flex items-center gap-2 text-zinc-400">
                        <span className="text-zinc-500 w-16 shrink-0">IP</span>
                        <code className="text-zinc-300">{log.client_ip}</code>
                      </div>
                    )}
                    {log.op_params &&
                      typeof log.op_params === "object" &&
                      !Array.isArray(log.op_params) &&
                      Object.keys(log.op_params).length > 0 && (
                        <div className="text-zinc-400">
                          <span className="text-zinc-500">Params</span>
                          <pre className="mt-1 text-zinc-300 bg-black/30 rounded-lg p-2 overflow-x-auto">
                            {JSON.stringify(log.op_params, null, 2)}
                          </pre>
                        </div>
                      )}
                    {log.error_detail && (
                      <div className="flex items-start gap-2 text-red-400">
                        <span className="text-zinc-500 w-16 shrink-0">Error</span>
                        <span>{log.error_detail}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

      {/* Load more button */}
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="w-full py-3 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </>
          ) : (
            "Load more"
          )}
        </button>
      )}
    </div>
  );
}

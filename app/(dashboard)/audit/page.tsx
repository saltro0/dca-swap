"use client";

import { useAuditLogs } from "@/hooks/use-audit-logs";
import { AuditFilters } from "@/components/audit/audit-filters";
import { AuditTable } from "@/components/audit/audit-table";
import { RefreshCw } from "lucide-react";

export default function AuditPage() {
  const { logs, loading, error, filters, setFilters, pagination, loadMore, refresh } =
    useAuditLogs();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Activity Log</h1>
          <p className="text-xs text-text-muted mt-0.5">
            All signing operations performed on your account
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/20 transition-all duration-200 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <AuditFilters filters={filters} onChange={setFilters} />

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      <AuditTable
        logs={logs}
        loading={loading}
        hasMore={pagination.hasMore}
        onLoadMore={loadMore}
      />

      {pagination.total > 0 && (
        <p className="text-xs text-zinc-500 text-center">
          Showing {logs.length} of {pagination.total} operations
        </p>
      )}
    </div>
  );
}

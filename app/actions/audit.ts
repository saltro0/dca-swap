"use server";

import { requireUser } from "@/lib/utils/guards";
import { getAdminSupabase, DB } from "@/lib/supabase/admin";
import type { AuditLogEntry, AuditLogFilters, AuditLogPagination } from "@/types";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export async function fetchAuditLogs(
  filters: AuditLogFilters = {},
  limit?: number,
  offset?: number
): Promise<{
  logs: AuditLogEntry[];
  pagination: AuditLogPagination;
  error?: string;
}> {
  try {
    const user = await requireUser();
    const supabase = getAdminSupabase();

    const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const effectiveOffset = offset ?? 0;

    let query = supabase
      .from(DB.AUDIT_LOG)
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (filters.type) query = query.eq("op_type", filters.type);
    if (filters.status) query = query.eq("result", filters.status);
    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) {
      // Append end-of-day so the selected date is inclusive
      const endOfDay = filters.dateTo.includes("T") ? filters.dateTo : `${filters.dateTo}T23:59:59.999Z`;
      query = query.lte("created_at", endOfDay);
    }

    const { data: logs, count, error } = await query.range(
      effectiveOffset,
      effectiveOffset + effectiveLimit - 1
    );

    if (error) {
      return {
        logs: [],
        pagination: { total: 0, limit: effectiveLimit, offset: effectiveOffset, hasMore: false },
        error: error.message,
      };
    }

    return {
      logs: (logs ?? []) as AuditLogEntry[],
      pagination: {
        total: count ?? 0,
        limit: effectiveLimit,
        offset: effectiveOffset,
        hasMore: (count ?? 0) > effectiveOffset + effectiveLimit,
      },
    };
  } catch (err: any) {
    return {
      logs: [],
      pagination: { total: 0, limit: DEFAULT_LIMIT, offset: 0, hasMore: false },
      error: err.message,
    };
  }
}

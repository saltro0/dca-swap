"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PositionDetail } from "@/components/dca/position-detail";
import {
  fetchPositionDetail,
  fetchExecutionHistory,
  stopDCAPosition,
  withdrawDCAPosition,
  topUpDCAPosition,
} from "@/app/actions/dca";
import type { DCAPositionSummary, DCAExecutionRecord } from "@/types";

export default function PositionDetailPage() {
  const { positionId } = useParams<{ positionId: string }>();
  const [position, setPosition] = useState<DCAPositionSummary | null>(null);
  const [executions, setExecutions] = useState<DCAExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const id = parseInt(positionId);
    Promise.all([
      fetchPositionDetail(id),
      fetchExecutionHistory(id),
    ]).then(([posRes, execRes]) => {
      if (posRes.position) setPosition(posRes.position);
      if (execRes.executions) setExecutions(execRes.executions);
    }).finally(() => setLoading(false));
  }, [positionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
      </div>
    );
  }

  if (!position) {
    return <p className="text-text-muted text-center py-8">Position not found</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dca" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">Position #{positionId}</h1>
      </div>
      <PositionDetail
        position={position}
        executions={executions}
        onRefresh={async () => {
          const id = parseInt(positionId);
          const [posRes, execRes] = await Promise.all([
            fetchPositionDetail(id),
            fetchExecutionHistory(id),
          ]);
          if (posRes.position) setPosition(posRes.position);
          if (execRes.executions) setExecutions(execRes.executions);
        }}
        onStop={async () => {
          setActionLoading(true);
          await stopDCAPosition(parseInt(positionId));
          setPosition((p) => p ? { ...p, status: "stopped" } : null);
          setActionLoading(false);
        }}
        onWithdraw={async () => {
          setActionLoading(true);
          await withdrawDCAPosition(parseInt(positionId));
          setPosition((p) => p ? { ...p, status: "withdrawn" } : null);
          setActionLoading(false);
        }}
        onTopUp={async (fd) => {
          setActionLoading(true);
          await topUpDCAPosition(parseInt(positionId), fd);
          setActionLoading(false);
        }}
        actionLoading={actionLoading}
      />
    </div>
  );
}

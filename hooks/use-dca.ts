"use client";

import { useCallback, useEffect, useState } from "react";
import { useDCAStore } from "@/store/dca-store";
import { useSessionStore } from "@/store/session-store";
import {
  fetchUserPositions,
  stopDCAPosition,
  withdrawDCAPosition,
} from "@/app/actions/dca";

export function useDCA() {
  const { user } = useSessionStore();
  const { positions, loading, error, setPositions, setLoading, setError, updatePositionStatus } =
    useDCAStore();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setPositions([]);
      return;
    }
    setLoading(true);
    fetchUserPositions()
      .then(({ positions: pos, error: err }) => {
        if (err) setError(err);
        else setPositions(pos);
      })
      .finally(() => setLoading(false));
  }, [user, setPositions, setLoading, setError]);

  const stop = useCallback(
    async (positionId: number) => {
      setActionLoading(`stop-${positionId}`);
      try {
        const result = await stopDCAPosition(positionId);
        if (result.success) {
          updatePositionStatus(positionId, "stopped");
        } else {
          setError(result.error || "Failed to stop position");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setActionLoading(null);
      }
    },
    [updatePositionStatus, setError]
  );

  const withdraw = useCallback(
    async (positionId: number) => {
      setActionLoading(`withdraw-${positionId}`);
      try {
        const result = await withdrawDCAPosition(positionId);
        if (result.success) {
          updatePositionStatus(positionId, "withdrawn");
        } else {
          setError(result.error || "Failed to withdraw");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setActionLoading(null);
      }
    },
    [updatePositionStatus, setError]
  );

  return {
    positions,
    loading,
    error,
    actionLoading,
    stop,
    withdraw,
  };
}

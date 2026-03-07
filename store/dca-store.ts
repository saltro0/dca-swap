import { create } from "zustand";
import type { DCAPositionSummary } from "@/types";

interface DCAState {
  positions: DCAPositionSummary[];
  loading: boolean;
  error: string | null;
  setPositions: (positions: DCAPositionSummary[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updatePositionStatus: (positionId: number, status: string) => void;
  clear: () => void;
}

export const useDCAStore = create<DCAState>((set) => ({
  positions: [],
  loading: false,
  error: null,
  setPositions: (positions) => set({ positions, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  updatePositionStatus: (positionId, status) =>
    set((state) => ({
      positions: state.positions.map((p) =>
        p.positionId === positionId ? { ...p, status: status as any } : p
      ),
    })),
  clear: () => set({ positions: [], loading: false, error: null }),
}));

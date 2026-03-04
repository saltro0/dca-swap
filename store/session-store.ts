import { create } from 'zustand'
import type { AccountSummary, SessionUser } from '@/types'

interface SessionState {
  user: SessionUser | null
  account: AccountSummary | null
  isLoading: boolean
  setUser: (user: SessionUser | null) => void
  setAccount: (account: AccountSummary | null) => void
  setLoading: (loading: boolean) => void
  clear: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  account: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setAccount: (account) => set({ account }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ user: null, account: null, isLoading: false }),
}))

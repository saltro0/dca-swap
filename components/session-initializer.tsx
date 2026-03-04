'use client'

import { useSession } from '@/hooks/use-session'

export function SessionInitializer() {
  useSession()
  return null
}

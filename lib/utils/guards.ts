import { createServerSupabase } from '@/lib/supabase/server'
import { headers } from 'next/headers'

/**
 * Get the authenticated user from the current cookie session.
 * For use inside Server Actions and Server Components.
 */
export async function requireUser() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthorized')
  }

  return user
}

/**
 * Extract client IP from request headers (for audit logging).
 */
export async function extractClientIp(): Promise<string | null> {
  const hdrs = await headers()
  return (
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip') ||
    null
  )
}

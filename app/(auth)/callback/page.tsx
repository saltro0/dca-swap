'use client'

import { useEffect } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function OAuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserSupabase()

    // Supabase SSR handles PKCE exchange via the code query param
    const { searchParams } = new URL(window.location.href)
    const code = searchParams.get('code')

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          console.error('[OAuth callback] session exchange failed:', error.message)
        }
        router.replace('/dashboard')
      })
    } else {
      // Fallback: hash-based tokens (implicit flow)
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(() => router.replace('/dashboard'))
      } else {
        router.replace('/login')
      }
    }
  }, [router])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-accent-cyan" />
      <p className="text-text-muted text-sm">Completing sign in...</p>
    </div>
  )
}

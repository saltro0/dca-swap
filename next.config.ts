import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  serverExternalPackages: ['@hashgraph/sdk', '@supabase/supabase-js'],
}

export default nextConfig

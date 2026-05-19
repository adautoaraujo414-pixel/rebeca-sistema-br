import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { allowedOrigins: ['*'] } },
  turbopack: { root: '/workspaces/rebeca-sistema-br/beca-estuda' },
}

export default nextConfig

import type { NextConfig } from 'next'

import { securityHeaders } from './lib/security/headers'

const nextConfig: NextConfig = {
  // Pin the project root: when developing from a git worktree nested inside
  // another checkout, Next's lockfile-based root inference walks too far up.
  turbopack: { root: import.meta.dirname },

  // subset-font (OG images) loads harfbuzz wasm from node_modules via fs —
  // bundling breaks the wasm path, so both stay external.
  serverExternalPackages: ['subset-font', 'harfbuzzjs'],

  // Shared-element morphs (cover/title) on route navigation; browsers
  // without the View Transitions API just navigate instantly.
  experimental: {
    viewTransition: true,
    sri: { algorithm: 'sha256' },
  },

  images: {
    // Post images are served from content/ via app/content/[...path]/route.ts;
    // site portraits/avatars live in public/images
    localPatterns: [
      { pathname: '/content/**' },
      { pathname: '/images/**' },
      { pathname: '/_next/static/**' },
    ],
  },

  headers: async () => [
    {
      source: '/:path*',
      headers: [...securityHeaders],
    },
  ],

  // Legacy URL back-compat (issue #75): every URL Google or anyone else has
  // indexed must keep working. Issue #101 owns the complete v3 native and
  // replacement contract; the rules below are the current compatibility base.
  redirects: async () => [
    // Social shortlinks (in bios and shared posts since v1)
    { source: '/twitter', destination: 'https://x.com/thecalicastle', permanent: true },
    { source: '/x', destination: 'https://x.com/thecalicastle', permanent: true },
    { source: '/youtube', destination: 'https://youtube.com/@calicastle', permanent: true },
    { source: '/tg', destination: 'https://t.me/cali_so', permanent: true },
    { source: '/linkedin', destination: 'https://www.linkedin.com/in/calicastle/', permanent: true },
    { source: '/github', destination: 'https://github.com/CaliCastle', permanent: true },
    { source: '/bilibili', destination: 'https://space.bilibili.com/8350251', permanent: true },

    // Retired in v3 (ADR-0003, ADR-0004)
    { source: '/guestbook', destination: '/', permanent: true },
    { source: '/sign-in', destination: '/', permanent: true },
    { source: '/sign-in/:path*', destination: '/', permanent: true },
    { source: '/sign-up', destination: '/', permanent: true },
    { source: '/sign-up/:path*', destination: '/', permanent: true },
    { source: '/studio', destination: '/', permanent: true },
    { source: '/studio/:path*', destination: '/', permanent: true },
  ],

  rewrites: async () => [
    // Feed aliases subscribed in RSS readers since v1
    { source: '/feed', destination: '/feed.xml' },
    { source: '/rss', destination: '/feed.xml' },
    { source: '/rss.xml', destination: '/feed.xml' },
  ],
}

export default nextConfig

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()

  return {
    ...react,
    ViewTransition: ({ children }: { children: React.ReactNode }) => children,
  }
})

vi.mock('@vercel/analytics/next', () => ({
  Analytics: () => <span data-vercel-analytics="" />,
}))

vi.mock('~/components/ambient-background', () => ({
  AmbientBackground: () => null,
}))
vi.mock('~/components/dock', () => ({
  Dock: () => null,
  DockFallback: () => null,
}))
vi.mock('~/components/locale-restorer', () => ({
  LocaleRestorer: () => null,
}))
vi.mock('~/components/site-footer', () => ({
  SiteFooter: () => null,
}))
vi.mock('~/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('~/lib/security/inline-scripts', () => ({
  PREPAINT_SCRIPT: '',
}))
vi.mock('~/lib/social-live', () => ({
  getGitHub: vi.fn().mockResolvedValue({}),
  getSocial: vi.fn().mockResolvedValue({}),
}))
vi.mock('./fonts', () => ({
  fontVariables: '',
}))

import { SiteDocument } from './_components/site-document'

describe('SiteDocument analytics', () => {
  it('collects page views across the public route families', async () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderToStaticMarkup(
        await SiteDocument({
          children: <p>Public page</p>,
          locale,
        }),
      )

      expect(html).toContain('data-vercel-analytics')
    }
  })

  it('keeps owner-admin routes outside public analytics', async () => {
    const html = renderToStaticMarkup(
      await SiteDocument({
        children: <p>Owner admin</p>,
        locale: 'zh',
        restoreLocale: true,
      }),
    )

    expect(html).not.toContain('data-vercel-analytics')
  })
})

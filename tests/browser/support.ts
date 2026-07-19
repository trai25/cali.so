import { expect, type Page } from '@playwright/test'

export const browserArticleFixture = {
  description: 'English article with a zoomable image and article map',
  path: '/en/blog/how-to-protect-your-site-with-upstash',
} as const

export async function prepareBrowserPage(page: Page) {
  if (process.env.PLAYWRIGHT_BASE_URL) return

  // Vercel serves this first-party endpoint only on hosted deployments.
  // Keep local production-build checks focused on application errors while
  // the hosted smoke suite verifies the real Insights script.
  await page.route('**/_vercel/insights/script.js', (route) =>
    route.fulfill({ body: '', contentType: 'application/javascript' }),
  )
}

export function watchBrowserErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return

    const text = message.text()
    const isBlockedVercelFeedbackToolbar =
      Boolean(process.env.PLAYWRIGHT_BASE_URL) &&
      text.includes('vercel.live') &&
      text.includes('Content Security Policy')

    // Vercel injects its Preview feedback toolbar outside the application.
    // The site's strict first-party CSP intentionally blocks that external
    // script, so this exact platform warning is not an application failure.
    if (!isBlockedVercelFeedbackToolbar) errors.push(text)
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

export async function gotoBrowserArticleFixture(page: Page) {
  const response = await page.goto(browserArticleFixture.path)

  expect(
    response?.status(),
    `Browser fixture is missing: ${browserArticleFixture.description} at ${browserArticleFixture.path}`,
  ).toBe(200)
  await expect(page.locator('article h1')).toBeVisible()
}

export async function expectHealthyPublicDocument(
  page: Page,
  path: string,
  lang: 'en' | 'zh-CN',
) {
  const response = await page.goto(path)

  expect(response?.status(), `Browser test route must return 200: ${path}`).toBe(200)
  await expect(page.locator('html')).toHaveAttribute('lang', lang)
  await expect(page.locator('main h1')).toBeVisible()
  await expect(page.locator('nav.dock button:not([disabled])')).toHaveCount(1)
  await expect(page.locator('nextjs-portal')).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
}

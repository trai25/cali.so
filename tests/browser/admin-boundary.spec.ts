import { expect, test } from '@playwright/test'

import { prepareBrowserPage, watchBrowserErrors } from './support'

for (const publicPath of ['/', '/en']) {
  test(`@hosted ${publicPath} loads Insights without loading Clerk`, async ({ page }) => {
    await prepareBrowserPage(page)
    const browserErrors = watchBrowserErrors(page)
    await page.goto(publicPath)

    await expect(page.locator('script[src="/_vercel/insights/script.js"]')).toHaveCount(1)
    await expect(page.locator('script[src*="clerk"]')).toHaveCount(0)
    expect(browserErrors).toEqual([])
  })
}

test('@hosted signed-out admin navigation stops at the authentication boundary', async ({
  request,
}) => {
  const response = await request.get('/admin', { maxRedirects: 0 })
  const headers = response.headers()
  const responseBody = await response.text()

  expect(headers['x-clerk-auth-status']).toBe('signed-out')
  expect(responseBody).not.toContain('/_vercel/insights/script.js')

  if (response.status() === 404) {
    expect(headers['x-clerk-auth-reason']).toBe('protect-rewrite, dev-browser-missing')
    return
  }

  expect([302, 307]).toContain(response.status())
  const location = new URL(headers.location)
  expect(location.origin).toBe('https://accounts.cali.so')
  expect(location.pathname).toBe('/sign-in')
  expect(new URL(location.searchParams.get('redirect_url')!).pathname).toBe('/admin')
})

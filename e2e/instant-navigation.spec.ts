import { instant } from '@next/playwright'
import { expect, test } from '@playwright/test'

const postSlug = '2023-year-in-review'

test('the Chinese post shell is available on navigation', async ({ page }) => {
  await page.goto('/')

  await instant(page, async () => {
    await page
      .getByRole('link', { name: /2023 年终总结，致我不同寻常的 28/ })
      .first()
      .click()

    await expect(page).toHaveURL(`/blog/${postSlug}`)
    await expect(page.getByRole('status', { name: '正在加载文章' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  })

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: '2023 年终总结，致我不同寻常的 28',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Twitter 与个人品牌' }),
  ).toBeVisible()
})

test('the English post shell is available on navigation', async ({ page }) => {
  await page.goto('/en')

  await instant(page, async () => {
    await page
      .getByRole('link', { name: /2023 Year in Review: My Unusual 28th Year/ })
      .first()
      .click()

    await expect(page).toHaveURL(`/en/blog/${postSlug}`)
    await expect(page.getByRole('status', { name: 'Loading article' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  })

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: '2023 Year in Review: My Unusual 28th Year',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Twitter and My Personal Brand',
    }),
  ).toBeVisible()
})

test('preferences preserve theme, locale, and reduced motion', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await page.getByRole('button', { name: '偏好设置' }).click()
  await page.getByRole('tab', { name: '深色' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.getByRole('tab', { name: 'English' }).click()
  await expect(page).toHaveURL('/en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches))
    .toBe(true)
  await expect
    .poll(() => page.locator('.enter').first().evaluate((element) => getComputedStyle(element).animationName))
    .toBe('none')
})

test('disabled administration stays outside public prefetching', async ({ page }) => {
  const prefetches: string[] = []
  page.on('request', (request) => {
    if (request.headers()['next-router-prefetch'] === '1') {
      prefetches.push(request.url())
    }
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  expect(prefetches.some((url) => new URL(url).pathname.startsWith('/admin'))).toBe(
    false,
  )

  const response = await page.goto('/admin')
  expect(response?.status()).toBe(404)
})

test('the home page reuses route shells without deeper per-link prefetches', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const prefetches: Array<{ segment?: string; url: string }> = []
  page.on('request', (request) => {
    const headers = request.headers()
    if (headers['next-router-prefetch'] === '1') {
      prefetches.push({
        segment: headers['next-router-segment-prefetch'],
        url: request.url(),
      })
    }
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  expect(prefetches).toHaveLength(6)
  expect(new Set(prefetches.map(({ segment }) => segment))).toEqual(
    new Set(['/_tree']),
  )
})

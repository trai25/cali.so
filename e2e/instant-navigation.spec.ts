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
  await expect
    .poll(() =>
      page
        .getByRole('button', { name: 'Preferences' })
        .evaluate((element) => getComputedStyle(element).transitionProperty),
    )
    .toBe('none')
})

test('public motion and typography follow the design contract', async ({ page }) => {
  await page.goto('/en')

  const preferences = page.getByRole('button', { name: 'Preferences' })
  await preferences.click()

  const chineseLabel = page.getByRole('tab', { name: '中文' }).locator('span').last()
  const englishLabel = page.getByRole('tab', { name: 'English' }).locator('span').last()
  const [chineseWeight, englishWeight] = await Promise.all([
    chineseLabel.evaluate((element) => getComputedStyle(element).fontVariationSettings),
    englishLabel.evaluate((element) => getComputedStyle(element).fontVariationSettings),
  ])
  expect(chineseWeight).toBe(englishWeight)
  const selectedContrast = await page
    .getByRole('tab', { name: 'English' })
    .evaluate((element) => {
      const label = element.querySelector('[data-tab-label]')
      return {
        background: getComputedStyle(element).backgroundColor,
        foreground: label ? getComputedStyle(label).color : '',
      }
    })
  expect(selectedContrast.foreground).not.toBe(selectedContrast.background)

  await page.keyboard.press('Escape')
  await expect(preferences).toBeFocused()
  await expect(page.locator('.footer-label').first()).toHaveCSS(
    'letter-spacing',
    '-0.154px',
  )

  await page.goto('/en/blog/do-buttons-need-pointer-cursors')
  await expect(page.locator('.tweet-card-body')).toHaveCSS('font-size', '14px')

  const zoom = page.locator('.zoom-trigger').last()
  await expect
    .poll(() => zoom.evaluate((element) => element.closest('.reveal-pending') !== null))
    .toBe(true)
  await zoom.scrollIntoViewIfNeeded()
  await expect
    .poll(() => zoom.evaluate((element) => element.closest('.reveal-in') !== null))
    .toBe(true)
  await expect(zoom).toHaveCSS('animation-duration', '0.3s')
  await expect(zoom).toHaveCSS(
    'animation-timing-function',
    'cubic-bezier(0.2, 0.8, 0.2, 1)',
  )

  await page.goto('/en/release-contract-check')
  await expect(page.locator('.error-proof-meta')).toHaveCSS(
    'letter-spacing',
    '-0.154px',
  )
  await expect(page.locator('.error-kicker')).toHaveCSS(
    'letter-spacing',
    '-0.154px',
  )
})

test('keyboard controls restore focus across public overlays', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/en')

  const preferences = page.getByRole('button', { name: 'Preferences' })
  await preferences.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'English' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('tab', { name: 'System' })).toBeFocused()
  const darkTab = page.getByRole('tab', { name: 'Dark' })
  await page.keyboard.press('ArrowRight')
  await expect(darkTab).toBeFocused()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.keyboard.press('Escape')
  await expect(preferences).toBeFocused()

  const postLink = page
    .getByRole('link', { name: /2023 Year in Review: My Unusual 28th Year/ })
    .first()
  await postLink.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(`/en/blog/${postSlug}`)

  const zoom = page.getByRole('button', { name: /^Zoom image/ }).first()
  await zoom.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(zoom).toBeFocused()

  await page.evaluate(() => window.scrollTo(0, 700))
  await expect(page.getByRole('button', { name: 'Open article map' })).toBeVisible()
  const articleMap = page.locator('.post-minimap-toggle')
  await articleMap.focus()
  await page.keyboard.press('Enter')
  await expect(articleMap).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(articleMap).toHaveAttribute('aria-expanded', 'false')
  await expect(articleMap).toBeFocused()
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

  expect(prefetches.length).toBeGreaterThan(0)
  expect(new Set(prefetches.map(({ segment }) => segment))).toEqual(
    new Set(['/_tree']),
  )
})

import { instant } from '@next/playwright'
import { expect, test } from '@playwright/test'

const postSlug = '2023-year-in-review'

// Next 16.3 preview.6 internal wire values, defined by FetchStrategy in
// next/dist/client/components/segment-cache/cache.js. Re-check on upgrades:
// 1 = route tree/loading boundary, 2 = PPR runtime data, 3 = runtime shell.
const prefetchKind = {
  routeTree: '1',
  runtimeData: '2',
  runtimeShell: '3',
} as const

async function observeCoverMorph(
  page: import('@playwright/test').Page,
  name: string,
) {
  await page.evaluate((transitionName) => {
    const state = window as typeof window & {
      __postCoverMorphObserved?: boolean
    }
    state.__postCoverMorphObserved = false

    let frame = 0
    const sample = () => {
      const animationName = getComputedStyle(
        document.documentElement,
        `::view-transition-group(${transitionName})`,
      ).animationName
      if (animationName !== 'none') state.__postCoverMorphObserved = true
      frame += 1
      if (frame < 120) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }, name)
}

async function expectCoverMorph(page: import('@playwright/test').Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as typeof window & {
              __postCoverMorphObserved?: boolean
            }).__postCoverMorphObserved ?? false,
        ),
      { message: 'expected the shared post cover transition to become active' },
    )
    .toBe(true)
}

test('the Chinese post shell is prefetched from the home page', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

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

test('the English post shell is prefetched from the home page', async ({ page }) => {
  await page.goto('/en')
  await page.waitForLoadState('networkidle')

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

test('the Chinese post shell morphs from the blog index cover', async ({ page }) => {
  await page.goto('/blog')
  await page.waitForLoadState('networkidle')

  const postLink = page
    .getByRole('link', {
      name: /2023 年终总结，致我不同寻常的 28/,
    })
    .first()
  const [coverTransitionName, titleTransitionName] = await Promise.all([
    postLink
      .locator('.print-thumb')
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('view-transition-name'),
      ),
    postLink
      .locator('.blog-row-title')
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('view-transition-name'),
      ),
  ])

  await instant(page, async () => {
    await observeCoverMorph(page, coverTransitionName)
    await postLink.click()

    await expect(page).toHaveURL(`/blog/${postSlug}`)
    await expect(page.getByRole('status', { name: '正在加载文章' })).toBeVisible()
    await expect(page.locator('html')).toHaveCSS(
      '--post-cover-transition-name',
      coverTransitionName,
    )
    await expect(page.locator('html')).toHaveCSS(
      '--post-title-transition-name',
      titleTransitionName,
    )
    await expectCoverMorph(page)
  })

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: '2023 年终总结，致我不同寻常的 28',
    }),
  ).toBeVisible()
})

test('the English post shell morphs from the blog index cover', async ({ page }) => {
  await page.goto('/en/blog')
  await page.waitForLoadState('networkidle')

  const postLink = page
    .getByRole('link', {
      name: /2023 Year in Review: My Unusual 28th Year/,
    })
    .first()
  const [coverTransitionName, titleTransitionName] = await Promise.all([
    postLink
      .locator('.print-thumb')
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('view-transition-name'),
      ),
    postLink
      .locator('.blog-row-title')
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('view-transition-name'),
    ),
  ])

  await instant(page, async () => {
    await observeCoverMorph(page, coverTransitionName)
    await postLink.click()

    await expect(page).toHaveURL(`/en/blog/${postSlug}`)
    await expect(page.getByRole('status', { name: 'Loading article' })).toBeVisible()
    await expect(page.locator('html')).toHaveCSS(
      '--post-cover-transition-name',
      coverTransitionName,
    )
    await expect(page.locator('html')).toHaveCSS(
      '--post-title-transition-name',
      titleTransitionName,
    )
    await expectCoverMorph(page)
  })

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: '2023 Year in Review: My Unusual 28th Year',
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

  await expect(page.locator('.home-introduction p').first()).toHaveCSS(
    'font-size',
    '14px',
  )
  await expect(page.locator('.home-contact-link').first()).toHaveCSS(
    'text-decoration-style',
    'dotted',
  )
  await expect
    .poll(() =>
      page
        .locator('.liquid-glass')
        .evaluate((element) => getComputedStyle(element).backdropFilter),
    )
    .toContain('blur(4px)')

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

  await page.goto('/en/blog')
  const focusRows = page.locator('.focus-list > li')
  await focusRows.first().hover()
  await expect(focusRows.nth(1)).toHaveCSS('filter', 'none')
  await expect(focusRows.nth(1)).toHaveCSS('opacity', '0.44')

  await page.goto('/en/blog/do-buttons-need-pointer-cursors')
  await expect(page.locator('.prose')).toHaveCSS('font-size', '14px')
  await expect(page.locator('.prose h2').first()).toHaveCSS('font-size', '18px')
  await expect(page.getByRole('link', { name: 'Back to writing' })).toBeVisible()
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
  await expect(preferences).toBeEnabled()
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
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue(
          '--post-cover-transition-name',
        ),
      ),
    )
    .toBe('')
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue(
          '--post-title-transition-name',
        ),
      ),
    )
    .toBe('')

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
  await expect(page.getByRole('link', { name: 'Back to writing' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(articleMap).toHaveAttribute('aria-expanded', 'false')
  await expect(articleMap).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(articleMap).toHaveAttribute('aria-expanded', 'true')
  await page.evaluate(() => {
    const scrollTo = window.scrollTo.bind(window)
    window.scrollTo = ((options: ScrollToOptions) => {
      document.documentElement.dataset.articleMapOpenAtScroll =
        document.querySelector('.post-minimap-toggle')?.getAttribute('aria-expanded') ??
        'missing'
      scrollTo(options)
    }) as typeof window.scrollTo
  })
  const backToTop = page.getByRole('button', { name: 'Back to top' })
  await expect(backToTop).toBeVisible()
  await backToTop.click()
  await expect(articleMap).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('html')).toHaveAttribute(
    'data-article-map-open-at-scroll',
    'false',
  )
})

test('administration stays outside public prefetching and requires login', async ({
  page,
}) => {
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

  for (const path of ['/admin', '/admin/photos?view=draft']) {
    const response = await page.request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBe(307)
    const location = new URL(response.headers().location)
    expect(location.protocol).toBe('https:')
    expect(location.pathname).toContain('/sign-in')
    const returnUrl = new URL(location.searchParams.get('redirect_url')!)
    const requestedUrl = new URL(path, page.url())
    expect(returnUrl.origin).toBe(requestedUrl.origin)
    expect(`${returnUrl.pathname}${returnUrl.search}`).toBe(
      `${requestedUrl.pathname}${requestedUrl.search}`,
    )
  }
})

test('the blog index prefetches one shared post shell without runtime article payloads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const prefetches: Array<{ kind?: string; segment?: string; url: string }> = []
  page.on('request', (request) => {
    const headers = request.headers()
    if (headers['next-router-prefetch']) {
      prefetches.push({
        kind: headers['next-router-prefetch'],
        segment: headers['next-router-segment-prefetch'],
        url: request.url(),
      })
    }
  })

  await page.goto('/blog')
  await page.waitForLoadState('networkidle')

  expect(prefetches.length).toBeGreaterThan(0)
  expect(
    prefetches.some(
      ({ kind, segment, url }) =>
        kind === prefetchKind.routeTree &&
        segment === '/_tree' &&
        new URL(url).pathname.startsWith('/blog/'),
    ),
  ).toBe(true)
  expect(
    prefetches.filter(
      ({ kind, url }) =>
        kind === prefetchKind.runtimeShell &&
        new URL(url).pathname.startsWith('/blog/'),
    ),
  ).toHaveLength(1)
  expect(
    prefetches.some(
      ({ kind, url }) =>
        kind === prefetchKind.runtimeData &&
        new URL(url).pathname.startsWith('/blog/'),
    ),
  ).toBe(false)
})

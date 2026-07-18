import { instant } from '@next/playwright'
import { expect, test, type Locator } from '@playwright/test'

const postSlug = '2023-year-in-review'

async function captureMotionDuration(element: Locator, scrollY: number, duration: number) {
  return element.evaluate(
    (target, input) =>
      new Promise<number[]>((resolve, reject) => {
        let finished = false
        const timeout = window.setTimeout(() => {
          finished = true
          reject(new Error(`Motion animation with ${input.duration}ms duration did not start`))
        }, 5_000)
        const capture = () => {
          if (finished) return
          const durations = target
            .getAnimations()
            .map((animation) => animation.effect?.getComputedTiming().duration)
            .filter((value): value is number => typeof value === 'number')
          if (durations.includes(input.duration)) {
            finished = true
            window.clearTimeout(timeout)
            resolve(durations)
            return
          }
          window.requestAnimationFrame(capture)
        }

        window.requestAnimationFrame(capture)
        window.scrollTo(0, input.scrollY)
      }),
    { scrollY, duration },
  )
}

// Next 16.3 preview.6 internal wire values, defined by FetchStrategy in
// next/dist/client/components/segment-cache/cache.js. Re-check on upgrades:
// 1 = route tree/loading boundary, 2 = PPR runtime data, 3 = runtime shell.
const prefetchKind = {
  routeTree: '1',
  runtimeData: '2',
  runtimeShell: '3',
} as const

type ViewTransitionLifecycleObservation = {
  counts: Record<string, number>
  nonZeroCounts: Record<string, number>
  samples: number
  stop: () => void
}

type ViewTransitionObservationWindow = typeof window & {
  __routeMotionObservation?: ViewTransitionLifecycleObservation
}

for (const entry of [
  {
    locale: 'Chinese',
    from: '/projects',
    home: '/',
    homeLabel: '首页',
    navigationLabel: '主导航',
    photos: '/photos',
  },
  {
    locale: 'English',
    from: '/en/projects',
    home: '/en',
    homeLabel: 'Home',
    navigationLabel: 'Main navigation',
    photos: '/en/photos',
  },
] as const) {
  test(`${entry.locale} dock navigation streams the home photo card`, async ({
    page,
  }) => {
    await page.goto(entry.from)
    await page.waitForLoadState('networkidle')

    await instant(page, async () => {
      await page
        .getByRole('navigation', { name: entry.navigationLabel })
        .getByRole('link', { name: entry.homeLabel })
        .click()

      await expect(page).toHaveURL(entry.home)
      await expect(
        page.getByRole('heading', { level: 1, name: 'Cali Castle' }),
      ).toBeVisible()
      await expect(
        page.locator(
          `.nav-cards > a[href="${entry.photos}"][aria-busy="true"]`,
        ),
      ).toBeVisible()
    })

    await expect(
      page.locator(`.nav-cards > a[href="${entry.photos}"]`),
    ).not.toHaveAttribute('aria-busy')
  })
}

for (const entry of [
  {
    locale: 'Chinese',
    from: '/projects',
    photos: '/photos',
    photosLabel: '照片',
    navigationLabel: '主导航',
  },
  {
    locale: 'English',
    from: '/en/projects',
    photos: '/en/photos',
    photosLabel: 'Photos',
    navigationLabel: 'Main navigation',
  },
] as const) {
  test(`${entry.locale} dock navigation streams the photo masonry`, async ({
    page,
  }) => {
    await page.goto(entry.from)
    await page.waitForLoadState('networkidle')

    await instant(page, async () => {
      await page
        .getByRole('navigation', { name: entry.navigationLabel })
        .getByRole('link', { name: entry.photosLabel })
        .click()

      await expect(page).toHaveURL(entry.photos)
      await expect(
        page.getByRole('heading', { level: 1, name: entry.photosLabel }),
      ).toBeVisible()
      await expect(page.getByRole('status')).toBeVisible()
    })

    await expect(page.getByRole('status')).not.toBeVisible()
  })
}

async function observeViewTransitionLifecycles(
  page: import('@playwright/test').Page,
) {
  await page.evaluate(() => {
    const state = window as ViewTransitionObservationWindow
    state.__routeMotionObservation?.stop()

    const seen = new WeakSet<Animation>()
    const lifecycleStarts = new Map<string, Set<number>>()
    const nonZeroLifecycleStarts = new Map<string, Set<number>>()
    let observing = true
    const observation: ViewTransitionLifecycleObservation = {
      counts: {},
      nonZeroCounts: {},
      samples: 0,
      stop: () => {
        observing = false
      },
    }
    state.__routeMotionObservation = observation

    function sample() {
      for (const animation of document.documentElement.getAnimations({
        subtree: true,
      })) {
        if (seen.has(animation)) continue

        const effect = animation.effect
        if (!(effect instanceof KeyframeEffect)) continue

        const pseudo = effect.pseudoElement
        if (!pseudo?.startsWith('::view-transition-')) continue

        const startTime = animation.startTime
        if (typeof startTime !== 'number') continue

        seen.add(animation)
        const starts = lifecycleStarts.get(pseudo) ?? new Set<number>()
        starts.add(startTime)
        lifecycleStarts.set(pseudo, starts)
        observation.counts[pseudo] = starts.size

        const duration = effect.getComputedTiming().duration
        if (typeof duration === 'number' && duration > 0) {
          const nonZeroStarts =
            nonZeroLifecycleStarts.get(pseudo) ?? new Set<number>()
          nonZeroStarts.add(startTime)
          nonZeroLifecycleStarts.set(pseudo, nonZeroStarts)
          observation.nonZeroCounts[pseudo] = nonZeroStarts.size
        }
      }

      observation.samples += 1
      if (observing) requestAnimationFrame(sample)
    }

    requestAnimationFrame(sample)
  })
}

async function viewTransitionLifecycleCount(
  page: import('@playwright/test').Page,
  pseudo: string,
  nonZero = false,
) {
  return page.evaluate(
    ({ pseudoElement, onlyNonZero }) => {
      const observation = (window as ViewTransitionObservationWindow)
        .__routeMotionObservation
      const counts = onlyNonZero
        ? observation?.nonZeroCounts
        : observation?.counts
      return counts?.[pseudoElement] ?? 0
    },
    { pseudoElement: pseudo, onlyNonZero: nonZero },
  )
}

async function expectNonZeroViewTransitionLifecycle(
  page: import('@playwright/test').Page,
  pseudo: string,
) {
  await expect
    .poll(() => viewTransitionLifecycleCount(page, pseudo, true), {
      message: `expected a non-zero ${pseudo} transition lifecycle`,
    })
    .toBeGreaterThan(0)
}

async function expectStaticRootTransition(
  page: import('@playwright/test').Page,
) {
  expect(
    await viewTransitionLifecycleCount(
      page,
      '::view-transition-old(root)',
      true,
    ),
  ).toBe(0)
  expect(
    await viewTransitionLifecycleCount(
      page,
      '::view-transition-new(root)',
      true,
    ),
  ).toBe(0)
}

async function waitForCoverTransitionToFinish(
  page: import('@playwright/test').Page,
  pseudo: string,
) {
  await page.evaluate(async (pseudoElement) => {
    const animations = document.documentElement
      .getAnimations({ subtree: true })
      .filter((animation) => {
        const effect = animation.effect
        if (!(effect instanceof KeyframeEffect)) return false
        if (effect.pseudoElement !== pseudoElement) return false

        const duration = effect.getComputedTiming().duration
        return typeof duration === 'number' && duration > 0
      })

    await Promise.allSettled(animations.map((animation) => animation.finished))
  }, pseudo)
}

async function nonZeroViewTransitionLifecycleCount(
  page: import('@playwright/test').Page,
) {
  return page.evaluate(() => {
    const counts = (window as ViewTransitionObservationWindow)
      .__routeMotionObservation?.nonZeroCounts
    return Object.values(counts ?? {}).reduce((total, count) => total + count, 0)
  })
}

async function waitForTransitionObserverSamples(
  page: import('@playwright/test').Page,
  additionalSamples = 2,
) {
  const firstSample = await page.evaluate(
    () =>
      (window as ViewTransitionObservationWindow).__routeMotionObservation
        ?.samples ?? 0,
  )
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as ViewTransitionObservationWindow)
              .__routeMotionObservation?.samples ?? 0,
        ),
      { message: 'expected the animation observer to sample committed frames' },
    )
    .toBeGreaterThanOrEqual(firstSample + additionalSamples)
}

async function stopViewTransitionLifecycleObserver(
  page: import('@playwright/test').Page,
) {
  await page.evaluate(() => {
    const observation = (window as ViewTransitionObservationWindow)
      .__routeMotionObservation
    observation?.stop()
  })
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
  const coverPseudo = `::view-transition-group(${coverTransitionName})`
  await observeViewTransitionLifecycles(page)

  await instant(page, async () => {
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
    await expectNonZeroViewTransitionLifecycle(page, coverPseudo)
    await expectStaticRootTransition(page)
    await waitForCoverTransitionToFinish(page, coverPseudo)
    await observeViewTransitionLifecycles(page)
  })

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: '2023 年终总结，致我不同寻常的 28',
    }),
  ).toBeVisible()
  await expectNonZeroViewTransitionLifecycle(page, coverPseudo)
  await expectStaticRootTransition(page)
  await expect(page.locator('html')).toHaveAttribute('data-route-motion', 'none')

  const animatedTransitionsBeforeBack =
    await nonZeroViewTransitionLifecycleCount(page)
  await page.goBack()
  await expect(page).toHaveURL('/blog')
  await expect(postLink).toBeVisible()
  await waitForTransitionObserverSamples(page)
  await expect(page.locator('html')).toHaveAttribute('data-route-motion', 'none')
  expect(await nonZeroViewTransitionLifecycleCount(page)).toBe(
    animatedTransitionsBeforeBack,
  )
  await stopViewTransitionLifecycleObserver(page)
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
  const coverPseudo = `::view-transition-group(${coverTransitionName})`
  await observeViewTransitionLifecycles(page)

  await instant(page, async () => {
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
    await expectNonZeroViewTransitionLifecycle(page, coverPseudo)
    await expectStaticRootTransition(page)
    await waitForCoverTransitionToFinish(page, coverPseudo)
    await observeViewTransitionLifecycles(page)
  })

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: '2023 Year in Review: My Unusual 28th Year',
    }),
  ).toBeVisible()
  await expectNonZeroViewTransitionLifecycle(page, coverPseudo)
  await expectStaticRootTransition(page)
  await expect(page.locator('html')).toHaveAttribute('data-route-motion', 'none')
  await stopViewTransitionLifecycleObserver(page)
})

test('keyboard post navigation keeps every route group instant', async ({
  page,
}) => {
  await page.goto('/blog')
  await page.waitForLoadState('networkidle')

  const postLink = page
    .getByRole('link', {
      name: /2023 年终总结，致我不同寻常的 28/,
    })
    .first()
  await observeViewTransitionLifecycles(page)

  await instant(page, async () => {
    await postLink.focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(`/blog/${postSlug}`)
    await expect(page.getByRole('status', { name: '正在加载文章' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-route-motion', 'none')
    await expect(page.locator('html')).toHaveCSS(
      '--post-cover-transition-name',
      '',
    )
    await expect(page.locator('html')).toHaveCSS(
      '--post-title-transition-name',
      '',
    )
    await waitForTransitionObserverSamples(page)
    expect(await nonZeroViewTransitionLifecycleCount(page)).toBe(0)
  })

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: '2023 年终总结，致我不同寻常的 28',
    }),
  ).toBeVisible()
  await waitForTransitionObserverSamples(page)
  expect(await nonZeroViewTransitionLifecycleCount(page)).toBe(0)
  await expect(page.locator('html')).toHaveAttribute('data-route-motion', 'none')
  await stopViewTransitionLifecycleObserver(page)
})

test('reduced motion keeps pointer post navigation instant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/en/blog')
  await page.waitForLoadState('networkidle')

  const postLink = page
    .getByRole('link', {
      name: /2023 Year in Review: My Unusual 28th Year/,
    })
    .first()
  await observeViewTransitionLifecycles(page)

  await instant(page, async () => {
    await postLink.click()

    await expect(page).toHaveURL(`/en/blog/${postSlug}`)
    await expect(page.getByRole('status', { name: 'Loading article' })).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-route-motion')
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        ),
      )
      .toBe(true)
    await waitForTransitionObserverSamples(page)
    expect(await nonZeroViewTransitionLifecycleCount(page)).toBe(0)
  })

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: '2023 Year in Review: My Unusual 28th Year',
    }),
  ).toBeVisible()
  await waitForTransitionObserverSamples(page)
  expect(await nonZeroViewTransitionLifecycleCount(page)).toBe(0)
  await expect(page.locator('html')).toHaveAttribute('data-route-motion', 'none')
  await stopViewTransitionLifecycleObserver(page)
})

test.describe('touch post navigation', () => {
  test.use({ hasTouch: true })

  test('a real touch tap preserves both post morph lifecycles', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/blog')
    await page.waitForLoadState('networkidle')

    const postLink = page
      .getByRole('link', {
        name: /2023 年终总结，致我不同寻常的 28/,
      })
      .first()
    const coverTransitionName = await postLink
      .locator('.print-thumb')
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('view-transition-name'),
      )
    const coverPseudo = `::view-transition-group(${coverTransitionName})`
    await observeViewTransitionLifecycles(page)

    await instant(page, async () => {
      await postLink.tap()

      await expect(page).toHaveURL(`/blog/${postSlug}`)
      await expect(page.getByRole('status', { name: '正在加载文章' })).toBeVisible()
      await expect(page.locator('html')).not.toHaveAttribute('data-route-motion')
      await expectNonZeroViewTransitionLifecycle(page, coverPseudo)
      await expectStaticRootTransition(page)
      await waitForCoverTransitionToFinish(page, coverPseudo)
      await observeViewTransitionLifecycles(page)
    })

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: '2023 年终总结，致我不同寻常的 28',
      }),
    ).toBeVisible()
    await expectNonZeroViewTransitionLifecycle(page, coverPseudo)
    await expectStaticRootTransition(page)
    await expect(page.locator('html')).toHaveAttribute(
      'data-route-motion',
      'none',
    )
    await stopViewTransitionLifecycleObserver(page)
  })
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

test('mobile article map animates its entrance and toggle states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/en/blog/${postSlug}`)

  const island = page.locator('.post-minimap-island')
  const articleMap = page.getByRole('button', { name: 'Open article map' })
  await expect(island).toHaveCSS('opacity', '0')

  const entranceDurations = await captureMotionDuration(island, 700, 200)
  expect(entranceDurations).toContain(200)
  await expect(articleMap).toBeVisible()

  const opening = await articleMap.evaluate(async (button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Article map toggle is not a button')
    }
    button.click()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const map = document.querySelector('.post-minimap')
    const nodes = [...document.querySelectorAll('.post-minimap-node')]
    return {
      expanded: button.getAttribute('aria-expanded'),
      mapAnimations: map?.getAnimations().length ?? 0,
      nodeAnimations: nodes.reduce(
        (count, node) => count + node.getAnimations().length,
        0,
      ),
    }
  })
  expect(opening.expanded).toBe('true')
  expect(opening.mapAnimations).toBeGreaterThan(0)
  expect(opening.nodeAnimations).toBeGreaterThan(0)

  await page.waitForFunction(() =>
    [...document.querySelectorAll('.post-minimap-node')].every(
      (node) => node.getAnimations().length === 0,
    ),
  )

  const closing = await page
    .getByRole('button', { name: 'Close article map' })
    .evaluate(async (button) => {
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error('Article map toggle is not a button')
      }
      button.click()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

      const map = document.querySelector('.post-minimap')
      const nodes = [...document.querySelectorAll('.post-minimap-node')]
      return {
        expanded: button.getAttribute('aria-expanded'),
        mapAnimations: map?.getAnimations().length ?? 0,
        nodeAnimations: nodes.reduce(
          (count, node) => count + node.getAnimations().length,
          0,
        ),
      }
    })
  expect(closing.expanded).toBe('false')
  expect(closing.mapAnimations).toBeGreaterThan(0)
  expect(closing.nodeAnimations).toBeGreaterThan(0)

  await page.waitForFunction(() =>
    [...document.querySelectorAll('.post-minimap-island, .post-minimap-node')].every(
      (node) => node.getAnimations().length === 0,
    ),
  )
  const exitDurations = await captureMotionDuration(island, 0, 160)
  expect(exitDurations).toContain(160)
  await expect(island).toHaveCSS('opacity', '0')
})

test('desktop article map shows reading progress', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/en/blog/${postSlug}`)

  const ring = page.locator('.post-minimap-progress')
  const progress = ring.locator('.post-minimap-progress-value')
  await expect(ring).toBeVisible()
  await expect(ring).toHaveCSS('width', '24px')
  await expect(progress).toHaveAttribute('stroke-dasharray', '0 1')

  await page.evaluate(() => window.scrollTo(0, 700))
  await expect
    .poll(() => progress.getAttribute('stroke-dasharray'))
    .not.toBe('0 1')
})

test('mobile article map honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/en/blog/${postSlug}`)

  const island = page.locator('.post-minimap-island')
  await page.evaluate(() => window.scrollTo(0, 700))
  await expect(page.getByRole('button', { name: 'Open article map' })).toBeVisible()
  expect(await island.evaluate((element) => element.getAnimations().length)).toBe(0)

  await page.getByRole('button', { name: 'Open article map' }).click()
  const activeAnimations = await page.locator('.post-minimap').evaluate((panel) => ({
    panel: panel.getAnimations().length,
    nodes: [...document.querySelectorAll('.post-minimap-node')].reduce(
      (count, node) => count + node.getAnimations().length,
      0,
    ),
  }))
  expect(activeAnimations).toEqual({ panel: 0, nodes: 0 })
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

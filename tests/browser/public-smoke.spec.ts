import { expect, test } from '@playwright/test'

import {
  expectHealthyPublicDocument,
  prepareBrowserPage,
  watchBrowserErrors,
} from './support'

const profiles = [
  {
    name: 'Chinese home on light desktop',
    path: '/',
    lang: 'zh-CN' as const,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light' as const,
    reducedMotion: 'no-preference' as const,
  },
  {
    name: 'English projects on dark desktop',
    path: '/en/projects',
    lang: 'en' as const,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark' as const,
    reducedMotion: 'no-preference' as const,
  },
  {
    name: 'Chinese writing on mobile',
    path: '/blog',
    lang: 'zh-CN' as const,
    viewport: { width: 390, height: 844 },
    colorScheme: 'light' as const,
    reducedMotion: 'no-preference' as const,
  },
  {
    name: 'English photos on reduced-motion mobile',
    path: '/en/photos',
    lang: 'en' as const,
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark' as const,
    reducedMotion: 'reduce' as const,
  },
  {
    name: 'Chinese AMA on desktop',
    path: '/ama',
    lang: 'zh-CN' as const,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light' as const,
    reducedMotion: 'no-preference' as const,
  },
  {
    name: 'English article on desktop',
    path: '/en/blog/how-to-protect-your-site-with-upstash',
    lang: 'en' as const,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light' as const,
    reducedMotion: 'no-preference' as const,
  },
]

for (const profile of profiles) {
  test(`@smoke @hosted ${profile.name} renders as a healthy public document`, async ({
    page,
  }) => {
    await prepareBrowserPage(page)
    const browserErrors = watchBrowserErrors(page)
    await page.setViewportSize(profile.viewport)
    await page.emulateMedia({
      colorScheme: profile.colorScheme,
      reducedMotion: profile.reducedMotion,
    })

    await expectHealthyPublicDocument(page, profile.path, profile.lang)

    await expect(page).toHaveTitle(/Cali/)
    expect(browserErrors).toEqual([])
  })
}

import { describe, expect, it } from 'vitest'

import nextConfig from '../next.config'

describe('server output tracing', () => {
  it('packages content and OG dependencies for runtime routes', () => {
    expect(nextConfig.outputFileTracingIncludes).toMatchObject({
      '/blog/**': expect.arrayContaining([
        './content/blog/**/*',
        './app/_fonts/FrexSansGB-OG-*.ttf',
      ]),
      '/en/blog/**': expect.arrayContaining([
        './content/blog/**/*',
        './app/_fonts/FrexSansGB-OG-*.ttf',
      ]),
      '/newsletters/**': expect.arrayContaining([
        './content/newsletters/**/*',
        './app/_fonts/FrexSansGB-OG-*.ttf',
      ]),
      '/en/newsletters/**': expect.arrayContaining([
        './content/newsletters/**/*',
        './app/_fonts/FrexSansGB-OG-*.ttf',
      ]),
      '/content/\\[\\.\\.\\.path\\]': [
        './content/blog/**/*',
        './content/newsletters/**/*',
      ],
    })
  })
})

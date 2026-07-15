import { describe, expect, it } from 'vitest'

import { localeFromPathname, localePath, unlocalizedPathname } from './locale-route'

describe('locale routes', () => {
  it('keeps Chinese paths unprefixed and prefixes English paths', () => {
    expect(localePath('zh', '/')).toBe('/')
    expect(localePath('en', '/')).toBe('/en')
    expect(localePath('zh', '/blog/a-post')).toBe('/blog/a-post')
    expect(localePath('en', '/blog/a-post')).toBe('/en/blog/a-post')
  })

  it('switches an existing localized path without losing its suffix', () => {
    expect(localePath('en', '/blog/a-post?from=feed#details')).toBe(
      '/en/blog/a-post?from=feed#details',
    )
    expect(localePath('zh', '/en/blog/a-post?from=feed#details')).toBe(
      '/blog/a-post?from=feed#details',
    )
    expect(localePath('en', '/en/blog/a-post?from=feed#details')).toBe(
      '/en/blog/a-post?from=feed#details',
    )
  })

  it('derives locale from the explicit public URL', () => {
    expect(localeFromPathname('/')).toBe('zh')
    expect(localeFromPathname('/blog/a-post')).toBe('zh')
    expect(localeFromPathname('/en')).toBe('en')
    expect(localeFromPathname('/en/blog/a-post')).toBe('en')
    expect(localeFromPathname('/english')).toBe('zh')
  })

  it('removes only an explicit English route segment', () => {
    expect(unlocalizedPathname('/en')).toBe('/')
    expect(unlocalizedPathname('/en/')).toBe('/')
    expect(unlocalizedPathname('/en/photos')).toBe('/photos')
    expect(unlocalizedPathname('/english')).toBe('/english')
  })

  it.each([
    'blog/a-post',
    '//example.com/blog',
    '/blog//a-post',
    '/blog/../admin',
    '/blog/%2e%2e/admin',
    '/blog/%2Fadmin',
    '/blog\\admin',
    '/blog/%E0%A4%A',
  ])('rejects malformed or traversal-like path input: %s', (path) => {
    expect(() => localePath('en', path)).toThrow('Invalid locale path')
  })
})

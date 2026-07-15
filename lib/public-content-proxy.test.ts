import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { proxy } from '../proxy'

describe('public content proxy', () => {
  it.each([
    '/blog/not-a-published-post',
    '/en/blog/not-a-published-post',
    '/newsletters/not-an-id',
    '/en/newsletters/not-an-id',
  ])('rewrites an unknown content route before streaming: %s', (pathname) => {
    const response = proxy(new NextRequest(`https://cali.so${pathname}`))

    expect(response.status).toBe(404)
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://cali.so/_not-found',
    )
  })

  it.each([
    '/blog/how-to-add-rss-to-your-nextjs-app-router',
    '/en/blog/how-to-add-rss-to-your-nextjs-app-router',
    '/newsletters/1',
    '/en/newsletters/1',
  ])('passes through a published content route: %s', (pathname) => {
    const response = proxy(new NextRequest(`https://cali.so${pathname}`))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.has('x-middleware-rewrite')).toBe(false)
  })
})

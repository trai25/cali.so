import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { proxy } from '../../proxy'

describe('admin CSP proxy', () => {
  it('uses a fresh strict nonce policy for each admin render', () => {
    const request = new NextRequest('https://cali.so/admin/login')
    const first = proxy(request).headers.get('content-security-policy')
    const second = proxy(request).headers.get('content-security-policy')

    expect(first).toMatch(
      /script-src 'self' 'nonce-[^']+' 'sha256-[^']+' 'strict-dynamic'/,
    )
    expect(first).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(first?.match(/'sha256-[^']+'/g)).toHaveLength(1)
    expect(first).toContain("style-src 'self' 'unsafe-inline'")
    expect(first).not.toBe(second)
  })
})

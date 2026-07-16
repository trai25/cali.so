import { describe, expect, it } from 'vitest'

import { createAmaLaunchBoundary } from './launch-boundary'
import type { AmaFeatureFlags, SecurityAuditEvent } from './service'

const disabledFeatures: AmaFeatureFlags = {
  publicMutations: false,
  payments: false,
  bookingFinalization: false,
  google: false,
  tencent: false,
}

describe('AMA launch boundary', () => {
  it('denies a disabled surface before downstream work can start', () => {
    const events: SecurityAuditEvent[] = []
    const boundary = createAmaLaunchBoundary({
      features: disabledFeatures,
      audit: { write(event) { events.push(event) } },
      clock: { now: () => new Date('2026-07-15T02:30:00.000Z') },
      requestId: () => 'launch-request-id',
    })

    const response = boundary.protect(
      new Request('https://cali.so/api/admin/auth/request'),
      ['google'],
    )

    expect(response?.status).toBe(503)
    expect(response?.headers.get('cache-control')).toBe('no-store')
    expect(response?.headers.get('referrer-policy')).toBe('no-referrer')
    expect(events).toEqual([
      {
        event: 'feature.disabled',
        timestamp: '2026-07-15T02:30:00.000Z',
        outcome: 'denied',
        requestId: 'launch-request-id',
      },
    ])
  })

  it('allows an enabled surface to continue to its normal security policy', () => {
    const boundary = createAmaLaunchBoundary({
      features: { ...disabledFeatures, google: true },
      audit: { write() { throw new Error('enabled requests are not denials') } },
    })

    expect(
      boundary.protect(new Request('https://cali.so/api/admin/auth/request'), [
        'google',
      ]),
    ).toBeNull()
  })
})

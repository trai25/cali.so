import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createOwnerReverifier,
  HIGH_IMPACT_REVERIFICATION,
} from './reverification'

describe('owner high-impact reverification', () => {
  it('returns Clerk standard reverification metadata for a stale first factor', async () => {
    const reverifier = createOwnerReverifier({
      hasFreshFirstFactor: vi.fn(async () => false),
    })

    const response = await reverifier.verify(
      new Request('https://cali.so/api/admin/media/photo-selection/publish'),
    )

    expect(response?.status).toBe(403)
    expect(response?.headers.get('cache-control')).toBe('no-store')
    expect(response?.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )
    expect(response?.headers.get('referrer-policy')).toBe('no-referrer')
    await expect(response?.json()).resolves.toEqual({
      clerk_error: {
        type: 'forbidden',
        reason: 'reverification-error',
        metadata: { reverification: HIGH_IMPACT_REVERIFICATION },
      },
    })
  })

  it('allows a first factor verified less than ten minutes ago', async () => {
    const hasFreshFirstFactor = vi.fn(async () => true)
    const reverifier = createOwnerReverifier({ hasFreshFirstFactor })
    const request = new Request(
      'https://cali.so/api/admin/media/photo-selection/publish',
    )

    await expect(reverifier.verify(request)).resolves.toBeNull()
    expect(hasFreshFirstFactor).toHaveBeenCalledExactlyOnceWith(
      HIGH_IMPACT_REVERIFICATION,
    )
  })
})

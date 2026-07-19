import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createCaptureLocationVault } from './capture-location'

describe('Media Library Capture Location vault', () => {
  it('stores coordinates only inside a media-specific encrypted envelope', () => {
    const vault = createCaptureLocationVault(
      Buffer.alloc(32, 7).toString('base64'),
    )
    const location = { latitude: 37.7749, longitude: -122.4194 }

    const envelope = vault.seal(location)

    expect(vault.open(envelope)).toEqual(location)
    expect(envelope).toMatchObject({
      version: 1,
      algorithm: 'aes-256-gcm',
    })
    expect(JSON.stringify(envelope)).not.toContain('37.7749')
    expect(JSON.stringify(envelope)).not.toContain('-122.4194')
  })

  it('fails closed with a safe error for a different media key', () => {
    const envelope = createCaptureLocationVault(
      Buffer.alloc(32, 3).toString('base64'),
    ).seal({ latitude: 25.033, longitude: 121.5654 })
    const otherVault = createCaptureLocationVault(
      Buffer.alloc(32, 4).toString('base64'),
    )

    expect(() => otherVault.open(envelope)).toThrow(
      'Unable to open Capture Location',
    )
    expect(() => otherVault.open(envelope)).not.toThrow(/25\.033|121\.5654/)
  })

  it('rejects malformed keys and out-of-range coordinates', () => {
    expect(() => createCaptureLocationVault('not-a-key')).toThrow(
      'Invalid Media encryption key',
    )
    const vault = createCaptureLocationVault(
      Buffer.alloc(32, 5).toString('base64'),
    )
    expect(() => vault.seal({ latitude: 91, longitude: 0 })).toThrow(
      'Invalid Capture Location',
    )
  })
})

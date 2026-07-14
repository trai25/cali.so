import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createSecretBox, type EncryptedSecretEnvelope } from './secrets'

describe('AMA encrypted secrets', () => {
  it('round-trips a secret through a versioned AES-256-GCM envelope', () => {
    const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'))

    const envelope = box.seal('refresh-token-value', 'google-refresh-token')

    expect(envelope).toMatchObject({ version: 1, algorithm: 'aes-256-gcm' })
    expect(JSON.stringify(envelope)).not.toContain('refresh-token-value')
    expect(box.open(envelope, 'google-refresh-token')).toBe('refresh-token-value')
  })

  it('uses a fresh random IV for every sealed secret', () => {
    const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'))

    const first = box.seal('same-secret', 'google-refresh-token')
    const second = box.seal('same-secret', 'google-refresh-token')

    expect(first.iv).not.toBe(second.iv)
    expect(first.ciphertext).not.toBe(second.ciphertext)
  })

  it('rejects a tampered ciphertext with a generic error', () => {
    const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'))
    const envelope = box.seal('do-not-expose-me', 'google-refresh-token')
    const tampered = {
      ...envelope,
      ciphertext: `${envelope.ciphertext.startsWith('A') ? 'B' : 'A'}${
        envelope.ciphertext.slice(1)
      }`,
    }

    expect(() => box.open(tampered, 'google-refresh-token')).toThrowError(
      'Unable to open encrypted secret',
    )
    try {
      box.open(tampered, 'google-refresh-token')
    } catch (error) {
      expect(String(error)).not.toContain('do-not-expose-me')
      expect(String(error)).not.toContain('authenticate')
      expect(String(error)).not.toContain('cipher')
    }
  })

  it('binds an encrypted secret to its declared purpose', () => {
    const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'))
    const envelope = box.seal('refresh-token-value', 'google-refresh-token')

    expect(() => box.open(envelope, 'google-pkce-verifier')).toThrowError(
      'Unable to open encrypted secret',
    )
  })

  it('rejects unsupported envelope versions with the same generic error', () => {
    const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'))
    const envelope = box.seal('refresh-token-value', 'google-refresh-token')
    const unsupported = { ...envelope, version: 2 } as unknown as EncryptedSecretEnvelope

    expect(() => box.open(unsupported, 'google-refresh-token')).toThrowError(
      'Unable to open encrypted secret',
    )
  })
})

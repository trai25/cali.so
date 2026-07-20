import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export type SecretPurpose = 'google-refresh-token' | 'google-pkce-verifier'

export type EncryptedSecretEnvelope = {
  version: 1
  algorithm: 'aes-256-gcm'
  iv: string
  ciphertext: string
  tag: string
}

const OPEN_ERROR = 'Unable to open encrypted secret'

function decodeKey(value: string) {
  const normalized = value.trim()
  const key = Buffer.from(normalized, 'base64')
  const canonical = key.toString('base64').replace(/=+$/, '')
  if (key.length !== 32 || canonical !== normalized.replace(/=+$/, '')) {
    throw new Error('Invalid encryption key')
  }
  return key
}

function additionalData(purpose: SecretPurpose) {
  return Buffer.from(`cali.so:ama:${purpose}:v1`, 'utf8')
}

export function createSecretBox(encodedKey: string) {
  const key = decodeKey(encodedKey)

  return {
    seal(plaintext: string, purpose: SecretPurpose): EncryptedSecretEnvelope {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(additionalData(purpose))
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

      return {
        version: 1,
        algorithm: 'aes-256-gcm',
        iv: iv.toString('base64url'),
        ciphertext: ciphertext.toString('base64url'),
        tag: cipher.getAuthTag().toString('base64url'),
      }
    },

    open(envelope: EncryptedSecretEnvelope, purpose: SecretPurpose): string {
      try {
        if (envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm') {
          throw new Error(OPEN_ERROR)
        }
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(envelope.iv, 'base64url'),
        )
        decipher.setAAD(additionalData(purpose))
        decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
        return Buffer.concat([
          decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
          decipher.final(),
        ]).toString('utf8')
      } catch {
        throw new Error(OPEN_ERROR)
      }
    },
  }
}

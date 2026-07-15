import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export type CaptureLocation = {
  latitude: number
  longitude: number
}

export type CaptureLocationEnvelope = {
  version: 1
  algorithm: 'aes-256-gcm'
  iv: string
  ciphertext: string
  tag: string
}

const additionalData = Buffer.from('cali.so:media:capture-location:v1', 'utf8')
const openError = 'Unable to open Capture Location'

function decodeKey(value: string) {
  const normalized = value.trim()
  const key = Buffer.from(normalized, 'base64')
  const canonical = key.toString('base64').replace(/=+$/, '')
  if (key.length !== 32 || canonical !== normalized.replace(/=+$/, '')) {
    throw new Error('Invalid Media encryption key')
  }
  return key
}

function assertCaptureLocation(value: unknown): asserts value is CaptureLocation {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof Reflect.get(value, 'latitude') !== 'number' ||
    !Number.isFinite(Reflect.get(value, 'latitude')) ||
    Reflect.get(value, 'latitude') < -90 ||
    Reflect.get(value, 'latitude') > 90 ||
    typeof Reflect.get(value, 'longitude') !== 'number' ||
    !Number.isFinite(Reflect.get(value, 'longitude')) ||
    Reflect.get(value, 'longitude') < -180 ||
    Reflect.get(value, 'longitude') > 180
  ) {
    throw new Error('Invalid Capture Location')
  }
}

export function createCaptureLocationVault(encodedKey: string) {
  const key = decodeKey(encodedKey)

  return {
    seal(location: CaptureLocation): CaptureLocationEnvelope {
      assertCaptureLocation(location)
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(additionalData)
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(location), 'utf8'),
        cipher.final(),
      ])
      return {
        version: 1,
        algorithm: 'aes-256-gcm',
        iv: iv.toString('base64url'),
        ciphertext: ciphertext.toString('base64url'),
        tag: cipher.getAuthTag().toString('base64url'),
      }
    },

    open(envelope: CaptureLocationEnvelope): CaptureLocation {
      try {
        if (envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm') {
          throw new Error(openError)
        }
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(envelope.iv, 'base64url'),
        )
        decipher.setAAD(additionalData)
        decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
        const plaintext = Buffer.concat([
          decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
          decipher.final(),
        ]).toString('utf8')
        const location: unknown = JSON.parse(plaintext)
        assertCaptureLocation(location)
        return location
      } catch {
        throw new Error(openError)
      }
    },
  }
}

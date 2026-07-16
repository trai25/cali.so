import 'server-only'

import { createHash, createHmac } from 'node:crypto'

/**
 * Manage Link tokens are derived, not stored: HMAC-SHA256 of the Booking id
 * under the server encryption key gives a 256-bit capability that can be
 * recomputed by any retried email delivery without persisting the raw token
 * anywhere. Only its SHA-256 hash lands in the database for lookup.
 */
export function deriveManageToken(encodedKey: string, bookingId: string): string {
  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32) throw new Error('Invalid encryption key')
  return createHmac('sha256', key)
    .update(`cali.so:ama:manage-link:v1:${bookingId}`, 'utf8')
    .digest('base64url')
}

export function manageTokenHash(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

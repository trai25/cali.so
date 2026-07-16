import 'server-only'

import { createHash, createHmac } from 'node:crypto'

/**
 * Manage Link tokens are derived, not stored: HMAC-SHA256 of the Booking id
 * under a purpose-specific subkey gives a 256-bit capability that can be
 * recomputed by any retried email delivery without persisting the raw token
 * anywhere. Only its SHA-256 hash lands in the database for lookup.
 *
 * The subkey is derived from the master key rather than using it directly,
 * so the AES secret-envelope usage of AMA_ENCRYPTION_KEY and this HMAC usage
 * never share key material.
 */
export function deriveManageToken(encodedKey: string, bookingId: string): string {
  const masterKey = Buffer.from(encodedKey, 'base64')
  if (masterKey.length !== 32) throw new Error('Invalid encryption key')
  const manageKey = createHmac('sha256', masterKey)
    .update('cali.so:ama:manage-link-key:v1', 'utf8')
    .digest()
  return createHmac('sha256', manageKey)
    .update(`cali.so:ama:manage-link:v1:${bookingId}`, 'utf8')
    .digest('base64url')
}

export function manageTokenHash(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

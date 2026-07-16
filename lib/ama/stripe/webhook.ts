import { createHmac, timingSafeEqual } from 'node:crypto'

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

export type StripeWebhookEvent = {
  id: string
  type: string
  object: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function constantTimeEquals(left: string, right: string) {
  const leftDigest = Buffer.from(left, 'utf8')
  const rightDigest = Buffer.from(right, 'utf8')
  if (leftDigest.length !== rightDigest.length) return false
  return timingSafeEqual(leftDigest, rightDigest)
}

/**
 * Verifies a Stripe webhook signature header (`t=...,v1=...`) against the
 * raw request body. Returns the parsed event only for a fresh, correctly
 * signed payload; every failure mode returns null without detail so the
 * route can respond uniformly.
 */
export function verifyStripeWebhook(input: {
  payload: string
  signatureHeader: string | null
  signingSecret: string
  now: Date
}): StripeWebhookEvent | null {
  if (!input.signatureHeader) return null

  let timestamp: number | null = null
  const signatures: string[] = []
  for (const part of input.signatureHeader.split(',')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key === 't' && /^\d+$/.test(value)) timestamp = Number(value)
    if (key === 'v1' && /^[0-9a-f]{64}$/.test(value)) signatures.push(value)
  }
  if (timestamp === null || signatures.length === 0) return null

  const ageSeconds = Math.abs(input.now.getTime() / 1000 - timestamp)
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) return null

  const expected = createHmac('sha256', input.signingSecret)
    .update(`${timestamp}.${input.payload}`, 'utf8')
    .digest('hex')
  if (!signatures.some((signature) => constantTimeEquals(signature, expected))) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(input.payload)
  } catch {
    return null
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.id !== 'string' ||
    !parsed.id ||
    typeof parsed.type !== 'string' ||
    !parsed.type ||
    !isRecord(parsed.data) ||
    !isRecord(parsed.data.object)
  ) {
    return null
  }
  return { id: parsed.id, type: parsed.type, object: parsed.data.object }
}

import { createHmac } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { verifyStripeWebhook } from './webhook'

const SIGNING_SECRET = 'whsec_test_signing_secret'
const NOW = new Date('2026-08-01T00:10:00.000Z')

function sign(payload: string, timestampSeconds: number, secret = SIGNING_SECRET) {
  return createHmac('sha256', secret)
    .update(`${timestampSeconds}.${payload}`, 'utf8')
    .digest('hex')
}

function eventPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_123', payment_status: 'paid' } },
    ...overrides,
  })
}

function header(payload: string, timestampSeconds: number, secret = SIGNING_SECRET) {
  return `t=${timestampSeconds},v1=${sign(payload, timestampSeconds, secret)}`
}

const nowSeconds = Math.floor(NOW.getTime() / 1000)

describe('Stripe webhook verification', () => {
  it('accepts a fresh, correctly signed event and parses it', () => {
    const payload = eventPayload()

    const event = verifyStripeWebhook({
      payload,
      signatureHeader: header(payload, nowSeconds),
      signingSecret: SIGNING_SECRET,
      now: NOW,
    })

    expect(event).toEqual({
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      object: { id: 'cs_test_123', payment_status: 'paid' },
    })
  })

  it('rejects a missing signature header', () => {
    expect(
      verifyStripeWebhook({
        payload: eventPayload(),
        signatureHeader: null,
        signingSecret: SIGNING_SECRET,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('rejects a malformed signature header', () => {
    for (const malformed of ['', 'garbage', 't=abc,v1=zzz', `v1=${'a'.repeat(64)}`, `t=${nowSeconds}`]) {
      expect(
        verifyStripeWebhook({
          payload: eventPayload(),
          signatureHeader: malformed,
          signingSecret: SIGNING_SECRET,
          now: NOW,
        }),
      ).toBeNull()
    }
  })

  it('rejects a signature made with the wrong secret', () => {
    const payload = eventPayload()

    expect(
      verifyStripeWebhook({
        payload,
        signatureHeader: header(payload, nowSeconds, 'whsec_other_secret'),
        signingSecret: SIGNING_SECRET,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('rejects a payload tampered with after signing', () => {
    const signed = eventPayload()
    const tampered = eventPayload({ id: 'evt_attacker' })

    expect(
      verifyStripeWebhook({
        payload: tampered,
        signatureHeader: header(signed, nowSeconds),
        signingSecret: SIGNING_SECRET,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('rejects a replayed timestamp older than five minutes', () => {
    const payload = eventPayload()
    const stale = nowSeconds - 5 * 60 - 1

    expect(
      verifyStripeWebhook({
        payload,
        signatureHeader: header(payload, stale),
        signingSecret: SIGNING_SECRET,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('rejects a future timestamp beyond the tolerance', () => {
    const payload = eventPayload()
    const future = nowSeconds + 5 * 60 + 1

    expect(
      verifyStripeWebhook({
        payload,
        signatureHeader: header(payload, future),
        signingSecret: SIGNING_SECRET,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('accepts a header carrying multiple v1 signatures when one matches', () => {
    const payload = eventPayload()
    const wrong = sign(payload, nowSeconds, 'whsec_rotated_out')
    const right = sign(payload, nowSeconds)

    const event = verifyStripeWebhook({
      payload,
      signatureHeader: `t=${nowSeconds},v1=${wrong},v1=${right}`,
      signingSecret: SIGNING_SECRET,
      now: NOW,
    })

    expect(event?.id).toBe('evt_test_1')
  })

  it('rejects a correctly signed payload that is not JSON', () => {
    const payload = 'not-json'

    expect(
      verifyStripeWebhook({
        payload,
        signatureHeader: header(payload, nowSeconds),
        signingSecret: SIGNING_SECRET,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('rejects signed JSON missing the event envelope fields', () => {
    const payloads = [
      JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } }),
      JSON.stringify({ id: 'evt_1', data: { object: {} } }),
      JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
      JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: {} }),
      JSON.stringify({ id: '', type: 'checkout.session.completed', data: { object: {} } }),
    ]

    for (const payload of payloads) {
      expect(
        verifyStripeWebhook({
          payload,
          signatureHeader: header(payload, nowSeconds),
          signingSecret: SIGNING_SECRET,
          now: NOW,
        }),
      ).toBeNull()
    }
  })
})

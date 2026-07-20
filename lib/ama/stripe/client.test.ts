import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { StripeError, createStripeClient } from './client'

const SECRET_KEY = 'sk_test_super_secret_value'

function sessionPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_123',
    url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    status: 'open',
    payment_status: 'unpaid',
    payment_intent: null,
    amount_total: 9900,
    currency: 'usd',
    metadata: { holdId: 'claim-1', intentId: 'intent-1' },
    ...overrides,
  }
}

function client(fetch: typeof globalThis.fetch) {
  return createStripeClient({ secretKey: SECRET_KEY, fetch })
}

function checkoutInput() {
  return {
    idempotencyKey: 'ama-checkout:claim-1',
    amount: 9900,
    currency: 'usd',
    productName: 'AMA Session with Cali (60 minutes)',
    customerEmail: 'ada@example.com',
    successUrl: 'https://cali.so/ama/book/confirmation?hold=claim-1',
    cancelUrl: 'https://cali.so/ama/book?checkout=cancelled',
    expiresAt: new Date('2026-08-01T00:30:00.000Z'),
    metadata: { holdId: 'claim-1', intentId: 'intent-1' },
    clientReferenceId: 'claim-1',
  }
}

describe('Stripe Checkout client', () => {
  it('creates a Checkout Session with an idempotency key and form-encoded body', async () => {
    const fetch = vi.fn(async () => Response.json(sessionPayload()))

    const session = await client(fetch).createCheckoutSession(checkoutInput())

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${SECRET_KEY}`,
      'Idempotency-Key': 'ama-checkout:claim-1',
      'Content-Type': 'application/x-www-form-urlencoded',
    })
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': '9900',
      'line_items[0][price_data][product_data][name]':
        'AMA Session with Cali (60 minutes)',
      customer_email: 'ada@example.com',
      success_url: 'https://cali.so/ama/book/confirmation?hold=claim-1',
      cancel_url: 'https://cali.so/ama/book?checkout=cancelled',
      expires_at: String(Date.parse('2026-08-01T00:30:00.000Z') / 1000),
      client_reference_id: 'claim-1',
      'metadata[holdId]': 'claim-1',
      'metadata[intentId]': 'intent-1',
    })
    expect(session).toEqual({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      status: 'open',
      paymentStatus: 'unpaid',
      paymentIntentId: null,
      amountTotal: 9900,
      currency: 'usd',
      metadata: { holdId: 'claim-1', intentId: 'intent-1' },
    })
  })

  it('parses a completed session and tolerates a null url', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        sessionPayload({
          url: null,
          status: 'complete',
          payment_status: 'paid',
          payment_intent: 'pi_test_1',
        }),
      ),
    )

    const session = await client(fetch).createCheckoutSession(checkoutInput())

    expect(session.url).toBeNull()
    expect(session.status).toBe('complete')
    expect(session.paymentStatus).toBe('paid')
    expect(session.paymentIntentId).toBe('pi_test_1')
  })

  it('rejects a session payload with an unknown status as an invalid response', async () => {
    const fetch = vi.fn(async () => Response.json(sessionPayload({ status: 'weird' })))

    await expect(client(fetch).createCheckoutSession(checkoutInput())).rejects.toEqual(
      new StripeError('invalid_response', 'Stripe returned an invalid response.'),
    )
  })

  it.each([
    [400, 'invalid_request'],
    [402, 'invalid_request'],
    [429, 'provider_unavailable'],
    [500, 'provider_unavailable'],
  ] as const)('maps HTTP %s to %s', async (status, code) => {
    const fetch = vi.fn(async () => new Response('{}', { status }))

    const attempt = client(fetch).createCheckoutSession(checkoutInput())

    await expect(attempt).rejects.toBeInstanceOf(StripeError)
    await expect(attempt).rejects.toMatchObject({ code })
  })

  it('maps a network failure to provider_unavailable', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('socket hang up')
    })

    await expect(
      client(fetch).createCheckoutSession(checkoutInput()),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
  })

  it('maps malformed JSON to invalid_response', async () => {
    const fetch = vi.fn(async () => new Response('not-json', { status: 200 }))

    await expect(
      client(fetch).createCheckoutSession(checkoutInput()),
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('never leaks the secret key through any failure mode', async () => {
    const failures: Array<typeof globalThis.fetch> = [
      vi.fn(async () => new Response('{}', { status: 400 })),
      vi.fn(async () => new Response('{}', { status: 429 })),
      vi.fn(async () => new Response('{}', { status: 500 })),
      vi.fn(async () => new Response('not-json', { status: 200 })),
      vi.fn(async () => Response.json(sessionPayload({ id: '' }))),
      vi.fn(async () => {
        throw new Error(`request with ${SECRET_KEY} failed`)
      }),
    ]

    for (const fetch of failures) {
      const error: unknown = await client(fetch)
        .createCheckoutSession(checkoutInput())
        .catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(StripeError)
      const stripeError = error as StripeError
      expect(stripeError.message).not.toContain(SECRET_KEY)
      expect(String(stripeError.stack)).not.toContain(SECRET_KEY)
    }
  })

  it('fetches a session by id with GET and path encoding', async () => {
    const fetch = vi.fn(async () => Response.json(sessionPayload({ id: 'cs a/b' })))

    const session = await client(fetch).getCheckoutSession('cs a/b')

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions/cs%20a%2Fb')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBeUndefined()
    expect(session.id).toBe('cs a/b')
  })

  it('creates a refund against the payment intent with an idempotency key', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ id: 're_test_1', status: 'succeeded' }),
    )

    const refund = await client(fetch).createRefund({
      idempotencyKey: 'ama-refund:booking-1',
      paymentIntentId: 'pi_test_1',
    })

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.stripe.com/v1/refunds')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'ama-refund:booking-1' })
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      payment_intent: 'pi_test_1',
    })
    expect(refund).toEqual({ id: 're_test_1', status: 'succeeded' })
  })

  it('maps refund failures like any other Stripe request', async () => {
    await expect(
      client(vi.fn(async () => new Response('{}', { status: 500 }))).createRefund({
        idempotencyKey: 'ama-refund:booking-1',
        paymentIntentId: 'pi_test_1',
      }),
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
    await expect(
      client(vi.fn(async () => Response.json({ id: 're_test_1' }))).createRefund({
        idempotencyKey: 'ama-refund:booking-1',
        paymentIntentId: 'pi_test_1',
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

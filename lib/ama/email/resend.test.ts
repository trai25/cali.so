import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createResendEmailSender } from './resend'
import type { EmailMessage } from './types'

const message: EmailMessage = {
  to: 'guest@example.com',
  subject: 'Your AMA Session with Cali is booked',
  text: 'Plain text body',
  html: '<p>HTML body</p>',
}

function createSender(fetch: typeof globalThis.fetch) {
  return createResendEmailSender({
    apiKey: 'resend-api-key-must-stay-private',
    from: 'Cali <sessions@cali.so>',
    fetch,
  })
}

describe('Resend email sender', () => {
  it('posts the message to Resend with auth, content type, and idempotency headers', async () => {
    const fetch = vi.fn(async () => Response.json({ id: 'resend-email-id-123' }))
    const sender = createSender(fetch)

    const result = await sender.send(message, 'booking-42:confirmation')

    expect(result).toEqual({ id: 'resend-email-id-123' })
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Authorization: 'Bearer resend-api-key-must-stay-private',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'booking-42:confirmation',
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      from: 'Cali <sessions@cali.so>',
      to: ['guest@example.com'],
      subject: message.subject,
      text: message.text,
      html: message.html,
    })
  })

  it('normalizes a 5xx response as provider unavailable', async () => {
    const sender = createSender(
      vi.fn(async () => Response.json({ message: 'internal error' }, { status: 500 })),
    )

    await expect(sender.send(message, 'booking-42:confirmation')).rejects.toMatchObject({
      name: 'EmailDeliveryError',
      code: 'provider_unavailable',
    })
  })

  it('normalizes a 429 response as provider unavailable', async () => {
    const sender = createSender(
      vi.fn(async () => Response.json({ message: 'rate limited' }, { status: 429 })),
    )

    await expect(sender.send(message, 'booking-42:confirmation')).rejects.toMatchObject({
      code: 'provider_unavailable',
    })
  })

  it('normalizes another 4xx response as an invalid request', async () => {
    const sender = createSender(
      vi.fn(async () => Response.json({ message: 'unprocessable' }, { status: 422 })),
    )

    await expect(sender.send(message, 'booking-42:confirmation')).rejects.toMatchObject({
      name: 'EmailDeliveryError',
      code: 'invalid_request',
    })
  })

  it('normalizes a transport failure as provider unavailable', async () => {
    const sender = createSender(
      vi.fn(async () => {
        throw new Error('socket hang up with resend-api-key-must-stay-private attached')
      }),
    )

    await expect(sender.send(message, 'booking-42:confirmation')).rejects.toMatchObject({
      code: 'provider_unavailable',
    })
  })

  it('never leaks the API key or raw provider body through errors', async () => {
    const sender = createSender(
      vi.fn(async () =>
        Response.json(
          { message: 'raw provider detail: resend-api-key-must-stay-private' },
          { status: 422 },
        ),
      ),
    )

    const error = await sender
      .send(message, 'booking-42:confirmation')
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'invalid_request' })
    expect(String(error)).not.toContain('resend-api-key-must-stay-private')
    expect(String(error)).not.toContain('raw provider detail')
    expect(JSON.stringify(error)).not.toContain('resend-api-key-must-stay-private')
  })

  it('returns a null id when the response has no string id', async () => {
    const sender = createSender(vi.fn(async () => Response.json({ id: 12345 })))

    await expect(sender.send(message, 'booking-42:confirmation')).resolves.toEqual({
      id: null,
    })
  })

  it('returns a null id when the response body is not JSON', async () => {
    const sender = createSender(
      vi.fn(async () => new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } })),
    )

    await expect(sender.send(message, 'booking-42:confirmation')).resolves.toEqual({
      id: null,
    })
  })
})

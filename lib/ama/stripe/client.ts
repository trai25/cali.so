import 'server-only'

const STRIPE_API = 'https://api.stripe.com/v1'

export type StripeErrorCode =
  | 'provider_unavailable'
  | 'invalid_request'
  | 'invalid_response'

export class StripeError extends Error {
  constructor(
    readonly code: StripeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'StripeError'
  }
}

export type StripeCheckoutSession = {
  id: string
  url: string | null
  status: 'open' | 'complete' | 'expired'
  paymentStatus: string | null
  paymentIntentId: string | null
  amountTotal: number | null
  currency: string | null
  metadata: Record<string, string>
}

export type StripeRefund = {
  id: string
  status: string
}

type StripeClientDependencies = {
  secretKey: string
  fetch: typeof fetch
}

type CreateCheckoutSessionInput = {
  idempotencyKey: string
  amount: number
  currency: string
  productName: string
  customerEmail: string
  successUrl: string
  cancelUrl: string
  expiresAt: Date
  metadata: Record<string, string>
  clientReferenceId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidResponse(): never {
  throw new StripeError('invalid_response', 'Stripe returned an invalid response.')
}

function parseCheckoutSession(payload: unknown): StripeCheckoutSession {
  if (
    !isRecord(payload) ||
    typeof payload.id !== 'string' ||
    !payload.id ||
    typeof payload.status !== 'string'
  ) {
    invalidResponse()
  }
  if (!['open', 'complete', 'expired'].includes(payload.status)) invalidResponse()
  const metadata: Record<string, string> = {}
  if (isRecord(payload.metadata)) {
    for (const [key, value] of Object.entries(payload.metadata)) {
      if (typeof value === 'string') metadata[key] = value
    }
  }
  return {
    id: payload.id,
    url: typeof payload.url === 'string' ? payload.url : null,
    status: payload.status as StripeCheckoutSession['status'],
    paymentStatus:
      typeof payload.payment_status === 'string' ? payload.payment_status : null,
    paymentIntentId:
      typeof payload.payment_intent === 'string' ? payload.payment_intent : null,
    amountTotal:
      typeof payload.amount_total === 'number' && Number.isFinite(payload.amount_total)
        ? payload.amount_total
        : null,
    currency: typeof payload.currency === 'string' ? payload.currency : null,
    metadata,
  }
}

export function createStripeClient(dependencies: StripeClientDependencies) {
  async function request(input: {
    path: string
    method: 'GET' | 'POST'
    idempotencyKey?: string
    form?: Record<string, string>
  }): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${dependencies.secretKey}`,
    }
    if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey
    let body: URLSearchParams | undefined
    if (input.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      body = new URLSearchParams(input.form)
    }

    let response: Response
    try {
      response = await dependencies.fetch(`${STRIPE_API}${input.path}`, {
        method: input.method,
        headers,
        body,
      })
    } catch {
      throw new StripeError(
        'provider_unavailable',
        'Stripe is temporarily unavailable.',
      )
    }
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new StripeError('invalid_request', 'Stripe rejected the request.')
      }
      throw new StripeError(
        'provider_unavailable',
        'Stripe is temporarily unavailable.',
      )
    }
    try {
      return await response.json()
    } catch {
      return invalidResponse()
    }
  }

  return {
    async createCheckoutSession(
      input: CreateCheckoutSessionInput,
    ): Promise<StripeCheckoutSession> {
      const form: Record<string, string> = {
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': input.currency,
        'line_items[0][price_data][unit_amount]': String(input.amount),
        'line_items[0][price_data][product_data][name]': input.productName,
        customer_email: input.customerEmail,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: String(Math.floor(input.expiresAt.getTime() / 1000)),
        client_reference_id: input.clientReferenceId,
      }
      for (const [key, value] of Object.entries(input.metadata)) {
        form[`metadata[${key}]`] = value
      }
      const payload = await request({
        path: '/checkout/sessions',
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        form,
      })
      return parseCheckoutSession(payload)
    },

    async getCheckoutSession(sessionId: string): Promise<StripeCheckoutSession> {
      const payload = await request({
        path: `/checkout/sessions/${encodeURIComponent(sessionId)}`,
        method: 'GET',
      })
      return parseCheckoutSession(payload)
    },

    async createRefund(input: {
      idempotencyKey: string
      paymentIntentId: string
    }): Promise<StripeRefund> {
      const payload = await request({
        path: '/refunds',
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        form: { payment_intent: input.paymentIntentId },
      })
      if (
        !isRecord(payload) ||
        typeof payload.id !== 'string' ||
        !payload.id ||
        typeof payload.status !== 'string'
      ) {
        invalidResponse()
      }
      return { id: payload.id, status: payload.status }
    },
  }
}

export type StripeClient = ReturnType<typeof createStripeClient>

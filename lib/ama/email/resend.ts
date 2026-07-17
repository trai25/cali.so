import 'server-only'

import { EmailDeliveryError, type EmailMessage, type EmailSender } from './types'

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails'

type ResendEmailSenderDependencies = {
  apiKey: string
  from: string
  fetch: typeof fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createResendEmailSender(
  dependencies: ResendEmailSenderDependencies,
): EmailSender {
  return {
    async send(message: EmailMessage, idempotencyKey: string) {
      let response: Response
      try {
        response = await dependencies.fetch(RESEND_EMAILS_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${dependencies.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            from: dependencies.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
        })
      } catch {
        throw new EmailDeliveryError(
          'provider_unavailable',
          'The email provider is temporarily unavailable.',
        )
      }
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new EmailDeliveryError(
            'provider_unavailable',
            'The email provider is temporarily unavailable.',
          )
        }
        throw new EmailDeliveryError(
          'invalid_request',
          `The email provider rejected the request (status ${response.status}).`,
        )
      }
      let payload: unknown = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      const id = isRecord(payload) && typeof payload.id === 'string' ? payload.id : null
      return { id }
    },
  }
}

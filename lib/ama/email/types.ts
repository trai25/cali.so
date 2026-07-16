export type EmailErrorCode = 'provider_unavailable' | 'invalid_request'

export class EmailDeliveryError extends Error {
  constructor(
    readonly code: EmailErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'EmailDeliveryError'
  }
}

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html: string
}

export interface EmailSender {
  /**
   * Sends one transactional email. The idempotency key makes a retried
   * delivery of the same logical message safe against duplication.
   */
  send(message: EmailMessage, idempotencyKey: string): Promise<{ id: string | null }>
}

export type BookingEmailKind =
  | 'confirmation'
  | 'rescheduled'
  | 'needs_reschedule'
  | 'cancelled'
  | 'reminder_24h'
  | 'reminder_1h'

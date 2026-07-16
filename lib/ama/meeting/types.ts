import type { MeetingProviderName } from '../booking/repository'

export type MeetingErrorCode =
  | 'provider_unavailable'
  | 'invalid_response'
  | 'unsupported'

export class MeetingProviderError extends Error {
  constructor(
    readonly code: MeetingErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'MeetingProviderError'
  }
}

export type MeetingCreateInput = {
  bookingId: string
  startsAt: Date
  endsAt: Date
  guestName: string
  subject: string
}

export type MeetingCreateResult = {
  meetingUrl: string
  providerMeetingId: string | null
}

/**
 * Explicit provider capabilities. Tencent Meeting exposes no guaranteed room
 * deletion, which stays visible here instead of being papered over.
 */
export type MeetingProviderCapabilities = {
  cancellation: boolean
}

export interface MeetingProviderAdapter {
  readonly name: MeetingProviderName
  readonly capabilities: MeetingProviderCapabilities
  createMeeting(input: MeetingCreateInput): Promise<MeetingCreateResult>
  cancelMeeting(providerMeetingId: string): Promise<'cancelled' | 'unsupported'>
}

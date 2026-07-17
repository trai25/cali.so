/**
 * The calendar contract Booking finalization depends on. Google Calendar is
 * the only implementation; the interface keeps durable operation handlers
 * testable with fakes and keeps provider error mapping in one place.
 */
export type CalendarWriteStatus =
  | 'connected'
  | 'disconnected'
  | 'denied-scope'
  | 'expired'
  | 'revoked'
  | 'unavailable'

export type CalendarEventInput = {
  /**
   * Client-derived stable event id (lowercase hex), making event creation
   * idempotent: re-inserting the same id is recognized instead of creating
   * a duplicate.
   */
  eventId: string
  summary: string
  description: string
  location: string | null
  startsAt: Date
  endsAt: Date
  guestEmail: string
  guestName: string
  /** Ask Google to attach a Meet conference to the event. */
  withMeetConference: boolean
}

export type CalendarEventResult =
  | { status: 'created'; meetUrl: string | null }
  | { status: Exclude<CalendarWriteStatus, 'connected'> }

export type CalendarMutationResult =
  | { status: 'done' }
  | { status: 'missing' }
  | { status: Exclude<CalendarWriteStatus, 'connected'> }

export interface BookingCalendar {
  createEvent(input: CalendarEventInput): Promise<CalendarEventResult>
  moveEvent(input: {
    eventId: string
    startsAt: Date
    endsAt: Date
  }): Promise<CalendarMutationResult>
  deleteEvent(eventId: string): Promise<CalendarMutationResult>
}

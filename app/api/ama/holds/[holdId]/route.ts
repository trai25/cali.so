import { createHoldStateHandler } from '~/lib/ama/booking/http'
import { getAmaBookingServices } from '~/lib/ama/booking/server'

const LOCAL_CONFIRMATION_FIXTURES = {
  '00000000-0000-4000-8000-000000000001': 'confirmed',
  '00000000-0000-4000-8000-000000000002': 'finalizing',
  '00000000-0000-4000-8000-000000000003': 'needs_reschedule',
} as const

export function getLocalConfirmationFixture(
  holdId: string,
  environment = process.env.NODE_ENV,
) {
  if (environment !== 'development') return null
  return LOCAL_CONFIRMATION_FIXTURES[
    holdId as keyof typeof LOCAL_CONFIRMATION_FIXTURES
  ] ?? null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ holdId: string }> },
) {
  const { holdId } = await params
  const fixture = getLocalConfirmationFixture(holdId)
  if (fixture) {
    return Response.json({
      hold: { state: 'paid', bookingStatus: fixture },
    })
  }

  const { booking } = getAmaBookingServices()
  return createHoldStateHandler({ service: booking })(request, holdId)
}

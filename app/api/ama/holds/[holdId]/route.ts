import { createHoldStateHandler } from '~/lib/ama/booking/http'
import { getAmaBookingServices } from '~/lib/ama/booking/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ holdId: string }> },
) {
  const { holdId } = await params
  const { booking } = getAmaBookingServices()
  return createHoldStateHandler({ service: booking })(request, holdId)
}

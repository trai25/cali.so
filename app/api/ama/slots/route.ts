import { createPublicSlotsHandler } from '~/lib/ama/booking/http'
import { getAmaBookingServices } from '~/lib/ama/booking/server'

export async function GET() {
  const { booking } = getAmaBookingServices()
  return createPublicSlotsHandler({ service: booking })()
}

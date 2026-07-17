import { createAlternateTimeRequestHandler } from '~/lib/ama/booking/http'
import { getAmaBookingServices } from '~/lib/ama/booking/server'
import { protectAmaLaunchBoundary } from '~/lib/ama/security/launch-boundary-server'

export async function POST(request: Request) {
  const blocked = protectAmaLaunchBoundary(request, ['publicMutations'])
  if (blocked) return blocked
  const { booking, guard } = getAmaBookingServices()
  return createAlternateTimeRequestHandler({ service: booking, guard })(request)
}

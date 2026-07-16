import { createCheckoutHandler } from '~/lib/ama/booking/http'
import { getAmaBookingServices } from '~/lib/ama/booking/server'
import { protectAmaLaunchBoundary } from '~/lib/ama/security/launch-boundary-server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ holdId: string }> },
) {
  const blocked = protectAmaLaunchBoundary(request, ['publicMutations', 'payments'])
  if (blocked) return blocked
  const { holdId } = await params
  const { booking, guard } = getAmaBookingServices()
  return createCheckoutHandler({ service: booking, guard })(request, holdId)
}

import { createManageCancelHandler } from '~/lib/ama/booking/http'
import { getAmaBookingServices } from '~/lib/ama/booking/server'
import { protectAmaLaunchBoundary } from '~/lib/ama/security/launch-boundary-server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const blocked = protectAmaLaunchBoundary(request, [
    'publicMutations',
    'bookingFinalization',
  ])
  if (blocked) return blocked
  const { token } = await params
  const { manage, guard } = getAmaBookingServices()
  return createManageCancelHandler({ manage, guard })(request, token)
}

import { createAdminTimeRequestActionHandler } from '~/lib/ama/admin/booking-http'
import {
  getAmaAdminServices,
  ownerHighImpactReverifier,
  ownerRequestAuthenticator,
} from '~/lib/ama/admin/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params
  const { bookingAdmin, security, baseUrl } = getAmaAdminServices()
  return createAdminTimeRequestActionHandler({
    authenticator: ownerRequestAuthenticator,
    service: bookingAdmin,
    security,
    baseUrl,
    reverifier: ownerHighImpactReverifier,
  })(request, requestId)
}

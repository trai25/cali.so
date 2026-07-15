import { createAvailabilityMutationHandler } from '~/lib/ama/admin/http'
import {
  getAmaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/ama/admin/server'
import { protectAmaLaunchBoundary } from '~/lib/ama/security/launch-boundary-server'

export async function POST(request: Request) {
  const blocked = protectAmaLaunchBoundary(request, ['admin'])
  if (blocked) return blocked
  const { availability, security, baseUrl } = getAmaAdminServices()
  return createAvailabilityMutationHandler({
    authenticator: ownerRequestAuthenticator,
    service: availability,
    security,
    baseUrl,
  })(request)
}

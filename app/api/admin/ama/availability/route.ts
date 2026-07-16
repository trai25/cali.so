import { createAvailabilityMutationHandler } from '~/lib/ama/admin/http'
import {
  getAmaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/ama/admin/server'

export async function POST(request: Request) {
  const { availability, security, baseUrl } = getAmaAdminServices()
  return createAvailabilityMutationHandler({
    authenticator: ownerRequestAuthenticator,
    service: availability,
    security,
    baseUrl,
  })(request)
}

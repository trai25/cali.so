import { createAvailabilityMutationHandler } from '~/lib/ama/admin/http'
import {
  getAmaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/ama/admin/server'

export async function POST(request: Request) {
  const { availability, baseUrl } = getAmaAdminServices()
  return createAvailabilityMutationHandler({
    authenticator: ownerRequestAuthenticator,
    service: availability,
    baseUrl,
  })(request)
}

import { createGoogleDisconnectHandler } from '~/lib/ama/admin/http'
import {
  getAmaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/ama/admin/server'

export async function POST(request: Request) {
  const { google, baseUrl } = getAmaAdminServices()
  return createGoogleDisconnectHandler({
    authenticator: ownerRequestAuthenticator,
    service: google,
    baseUrl,
  })(request)
}

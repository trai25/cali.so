import { createGoogleConnectHandler } from '~/lib/ama/admin/http'
import {
  getAmaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/ama/admin/server'

export async function POST(request: Request) {
  const { google, security, baseUrl } = getAmaAdminServices()
  return createGoogleConnectHandler({
    authenticator: ownerRequestAuthenticator,
    service: google,
    security,
    baseUrl,
  })(request)
}

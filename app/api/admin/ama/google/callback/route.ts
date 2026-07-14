import { createGoogleCallbackHandler } from '~/lib/ama/admin/http'
import {
  getAmaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/ama/admin/server'

export async function GET(request: Request) {
  const { google, security, baseUrl } = getAmaAdminServices()
  return createGoogleCallbackHandler({
    authenticator: ownerRequestAuthenticator,
    service: google,
    security,
    baseUrl,
  })(request)
}

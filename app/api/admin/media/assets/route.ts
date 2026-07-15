import { createMediaAssetListHandler } from '~/lib/media/admin/http'
import {
  getMediaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/media/admin/server'

export async function GET(request: Request) {
  const { review, security } = getMediaAdminServices()
  return createMediaAssetListHandler({
    authenticator: ownerRequestAuthenticator,
    review,
    security,
  })(request)
}

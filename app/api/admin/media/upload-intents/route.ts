import { createMediaUploadIntentHandler } from '~/lib/media/admin/http'
import {
  getMediaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/media/admin/server'

export async function POST(request: Request) {
  const { ingestion, security } = getMediaAdminServices()
  return createMediaUploadIntentHandler({
    authenticator: ownerRequestAuthenticator,
    ingestion,
    security,
  })(request)
}

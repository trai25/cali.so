import { createMediaOriginalUploadHandler } from '~/lib/media/admin/http'
import {
  getMediaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/media/admin/server'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ uploadIntentId: string }> },
) {
  const { baseUrl, ingestionRepository, security, storage } =
    getMediaAdminServices()
  return createMediaOriginalUploadHandler({
    authenticator: ownerRequestAuthenticator,
    baseUrl,
    ingestionRepository,
    security,
    storage,
  })(request, (await params).uploadIntentId)
}

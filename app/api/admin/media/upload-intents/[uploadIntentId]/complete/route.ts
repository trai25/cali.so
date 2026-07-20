import { createMediaUploadCompletionHandler } from '~/lib/media/admin/http'
import {
  getMediaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/media/admin/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uploadIntentId: string }> },
) {
  const { ingestion, security } = getMediaAdminServices()
  return createMediaUploadCompletionHandler({
    authenticator: ownerRequestAuthenticator,
    ingestion,
    security,
  })(request, (await params).uploadIntentId)
}

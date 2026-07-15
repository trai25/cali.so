import { createMediaAssetActionHandler } from '~/lib/media/admin/http'
import {
  getMediaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/media/admin/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaAssetId: string }> },
) {
  const { mediaAssetId } = await params
  const { review, security } = getMediaAdminServices()
  return createMediaAssetActionHandler({
    authenticator: ownerRequestAuthenticator,
    review,
    security,
  })(request, mediaAssetId)
}

import { createMediaLocationLabelHandler } from '~/lib/media/admin/http'
import {
  getMediaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/media/admin/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaAssetId: string }> },
) {
  const { mediaAssetId } = await params
  const { geocoding, security } = getMediaAdminServices()
  return createMediaLocationLabelHandler({
    authenticator: ownerRequestAuthenticator,
    geocoding,
    security,
  })(request, mediaAssetId)
}

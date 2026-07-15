import { createMediaAltTextHandler } from '~/lib/media/admin/http'
import {
  getMediaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/media/admin/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaAssetId: string }> },
) {
  const { mediaAssetId } = await params
  const { altText, security } = getMediaAdminServices()
  return createMediaAltTextHandler({
    altText,
    authenticator: ownerRequestAuthenticator,
    security,
  })(request, mediaAssetId)
}

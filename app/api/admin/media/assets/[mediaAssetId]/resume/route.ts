import { createMediaResumeHandler } from '~/lib/media/admin/http'
import {
  getMediaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/media/admin/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaAssetId: string }> },
) {
  const { mediaAssetId } = await params
  const { reconciliation, review, security } = getMediaAdminServices()
  return createMediaResumeHandler({
    authenticator: ownerRequestAuthenticator,
    reconciliation,
    review,
    security,
  })(request, mediaAssetId)
}

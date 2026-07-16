import { createPhotoSelectionPublishHandler } from '~/lib/media/admin/http'
import {
  getMediaAdminServices,
  ownerHighImpactReverifier,
  ownerRequestAuthenticator,
} from '~/lib/media/admin/server'

export async function POST(request: Request) {
  const { security, selection } = getMediaAdminServices()
  return createPhotoSelectionPublishHandler({
    authenticator: ownerRequestAuthenticator,
    security,
    selection,
    reverifier: ownerHighImpactReverifier,
  })(request)
}

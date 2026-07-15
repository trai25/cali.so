import { createPhotoSelectionDraftHandler } from '~/lib/media/admin/http'
import {
  getMediaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/media/admin/server'

export async function PUT(request: Request) {
  const { security, selection } = getMediaAdminServices()
  return createPhotoSelectionDraftHandler({
    authenticator: ownerRequestAuthenticator,
    security,
    selection,
  })(request)
}

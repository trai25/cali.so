import { createMediaTransferDiscardHandler } from '~/lib/media/admin/http'
import {
  getMediaAdminServices,
  ownerRequestAuthenticator,
} from '~/lib/media/admin/server'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ uploadIntentId: string }> },
) {
  const { uploadIntentId } = await params
  const { security, transfer } = getMediaAdminServices()
  return createMediaTransferDiscardHandler({
    authenticator: ownerRequestAuthenticator,
    security,
    transfer,
  })(request, uploadIntentId)
}

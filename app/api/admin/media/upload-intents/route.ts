import {
  createMediaTransferListHandler,
  createMediaUploadIntentHandler,
} from '~/lib/media/admin/http'
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

export async function GET(request: Request) {
  const { security, transfer } = getMediaAdminServices()
  return createMediaTransferListHandler({
    authenticator: ownerRequestAuthenticator,
    security,
    transfer,
  })(request)
}

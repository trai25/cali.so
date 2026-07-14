import { createMagicLinkVerifyHandler } from '~/lib/ama/auth/http'
import { getOwnerAuth } from '~/lib/ama/auth/server'

export async function GET(request: Request) {
  return createMagicLinkVerifyHandler(getOwnerAuth())(request)
}

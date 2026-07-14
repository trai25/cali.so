import { createMagicLinkVerifyHandler } from '~/lib/ama/auth/http'
import { getOwnerAuth } from '~/lib/ama/auth/server'
import { getAmaSecurity } from '~/lib/ama/security/server'

export async function GET(request: Request) {
  return createMagicLinkVerifyHandler(getOwnerAuth(), getAmaSecurity())(request)
}

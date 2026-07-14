import { createLogoutHandler } from '~/lib/ama/auth/http'
import { getOwnerAuth } from '~/lib/ama/auth/server'
import { getAmaSecurity } from '~/lib/ama/security/server'

export async function POST(request: Request) {
  return createLogoutHandler(getOwnerAuth(), getAmaSecurity())(request)
}

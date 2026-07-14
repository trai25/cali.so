import { createLogoutHandler } from '~/lib/ama/auth/http'
import { getOwnerAuth } from '~/lib/ama/auth/server'

export async function POST(request: Request) {
  return createLogoutHandler(getOwnerAuth())(request)
}

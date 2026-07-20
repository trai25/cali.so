import { auth, clerkClient } from '@clerk/nextjs/server'

import { createAdminLogoutHandler } from '~/lib/admin/logout'
import {
  getOwnerAccess,
  getOwnerAdminSecurity,
} from '~/lib/admin/server'

export async function POST(request: Request) {
  return createAdminLogoutHandler({
    security: getOwnerAdminSecurity(),
    getAccess: getOwnerAccess,
    async getSessionId() {
      return (await auth()).sessionId
    },
    async revokeSession(sessionId) {
      await (await clerkClient()).sessions.revokeSession(sessionId)
    },
  })(request)
}

import 'server-only'

import { authenticateOwnerRequest } from '~/lib/ama/auth/http'
import { getOwnerAuth, isOwnerAuthenticated } from '~/lib/ama/auth/server'
import { getServerEnv } from '~/lib/ama/server-env'
import { getAmaSecurity } from '~/lib/ama/security/server'

export async function getOwnerPrincipal() {
  if (!(await isOwnerAuthenticated())) return null
  return { id: getServerEnv().ADMIN_EMAIL }
}

export const ownerRequestAuthenticator = {
  async authenticate(request: Request) {
    const authenticated = await authenticateOwnerRequest(getOwnerAuth(), request)
    return authenticated ? { id: getServerEnv().ADMIN_EMAIL } : null
  },
}

export function getOwnerAdminSecurity() {
  return getAmaSecurity()
}

import 'server-only'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { forbidden } from 'next/navigation'
import { cache } from 'react'

import { getAmaSecurity } from '~/lib/ama/security/server'
import { getServerEnv } from '~/lib/ama/server-env'

import {
  createOwnerAuthorizer,
  type OwnerPrincipal,
} from './authorization'
import { createOwnerReverifier } from './reverification'

const authorizeOwner = createOwnerAuthorizer({
  getOwnerDataId() {
    return getServerEnv().ADMIN_EMAIL
  },
  async getAuthentication() {
    const { isAuthenticated, sessionStatus, userId } = await auth()
    return { isAuthenticated, sessionStatus, userId }
  },
  async getUser(userId) {
    return (await clerkClient()).users.getUser(userId)
  },
})

export const getOwnerAccess = cache(authorizeOwner)

export const ownerHighImpactReverifier = createOwnerReverifier({
  async hasFreshFirstFactor(requirement) {
    const { has } = await auth()
    return has({ reverification: requirement })
  },
})

export async function requireOwnerPage(
  returnBackUrl: string,
): Promise<OwnerPrincipal> {
  const access = await getOwnerAccess()
  if (access.status === 'authorized') return access.principal
  if (access.status === 'forbidden') forbidden()

  const { redirectToSignIn } = await auth()
  await redirectToSignIn({ returnBackUrl })
  throw new Error('Clerk sign-in redirect did not terminate the request')
}

export const ownerRequestAuthenticator = {
  // Clerk resolves auth from the active Next.js request context, not this object.
  authenticate(_request: Request) {
    return getOwnerAccess()
  },
}

export function getOwnerAdminSecurity() {
  return getAmaSecurity()
}

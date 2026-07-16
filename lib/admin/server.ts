import 'server-only'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { forbidden } from 'next/navigation'
import { cache } from 'react'

import { getAmaSecurity } from '~/lib/ama/security/server'
import { getServerEnv } from '~/lib/ama/server-env'

import { createOwnerAuthorizer } from './authorization'

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

export async function requireOwnerPage(returnBackUrl: string) {
  const access = await getOwnerAccess()
  if (access.status === 'authorized') return access.principal
  if (access.status === 'forbidden') forbidden()

  const { redirectToSignIn } = await auth()
  return redirectToSignIn({ returnBackUrl })
}

export const ownerRequestAuthenticator = {
  authenticate() {
    return getOwnerAccess()
  },
}

export function getOwnerAdminSecurity() {
  return getAmaSecurity()
}

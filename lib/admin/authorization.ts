export type OwnerPrincipal = {
  id: string
  actorId: string
}

export type OwnerAccess =
  | { status: 'authorized'; principal: OwnerPrincipal }
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }

type OwnerAuthorizerDependencies = {
  getOwnerDataId(): string
  getAuthentication(): Promise<{
    isAuthenticated: boolean
    sessionStatus: 'active' | 'pending' | null | undefined
    userId: string | null
  }>
  getUser(userId: string): Promise<{
    id: string
    publicMetadata: Record<string, unknown>
  }>
}

export function createOwnerAuthorizer({
  getOwnerDataId,
  getAuthentication,
  getUser,
}: OwnerAuthorizerDependencies) {
  return async function authorizeOwner(): Promise<OwnerAccess> {
    const { isAuthenticated, sessionStatus, userId } =
      await getAuthentication()
    if (!isAuthenticated || sessionStatus !== 'active' || !userId) {
      return { status: 'unauthenticated' }
    }

    const user = await getUser(userId)
    if (user.id !== userId || user.publicMetadata.siteOwner !== 'yes') {
      return { status: 'forbidden' }
    }

    return {
      status: 'authorized',
      principal: { id: getOwnerDataId(), actorId: userId },
    }
  }
}

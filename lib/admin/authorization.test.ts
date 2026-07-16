import { describe, expect, it } from 'vitest'

import { createOwnerAuthorizer } from './authorization'

describe('owner authorization', () => {
  it('requires an authenticated Clerk user', async () => {
    const authorize = createOwnerAuthorizer({
      getOwnerDataId() {
        return 'owner@example.com'
      },
      async getAuthentication() {
        return {
          isAuthenticated: false,
          sessionStatus: undefined,
          userId: null,
        }
      },
      async getUser() {
        throw new Error('signed-out requests must not load a user')
      },
    })

    await expect(authorize()).resolves.toEqual({ status: 'unauthenticated' })
  })

  it.each([
    {
      isAuthenticated: false,
      sessionStatus: 'active' as const,
      userId: 'user_owner',
    },
    {
      isAuthenticated: true,
      sessionStatus: 'pending' as const,
      userId: 'user_owner',
    },
    {
      isAuthenticated: true,
      sessionStatus: 'active' as const,
      userId: null,
    },
  ])('rejects incomplete Clerk session state: %o', async (authentication) => {
    const authorize = createOwnerAuthorizer({
      getOwnerDataId() {
        return 'owner@example.com'
      },
      async getAuthentication() {
        return authentication
      },
      async getUser() {
        throw new Error('incomplete sessions must not load a user')
      },
    })

    await expect(authorize()).resolves.toEqual({ status: 'unauthenticated' })
  })

  it.each([
    {},
    { siteOwner: true },
    { siteOwner: 'no' },
  ])('denies a Clerk user without the exact owner marker: %o', async (publicMetadata) => {
    const authorize = createOwnerAuthorizer({
      getOwnerDataId() {
        return 'owner@example.com'
      },
      async getAuthentication() {
        return {
          isAuthenticated: true,
          sessionStatus: 'active',
          userId: 'user_guest',
        }
      },
      async getUser() {
        return { id: 'user_guest', publicMetadata }
      },
    })

    await expect(authorize()).resolves.toEqual({ status: 'forbidden' })
  })

  it('authorizes the Clerk user marked as the site owner', async () => {
    const authorize = createOwnerAuthorizer({
      getOwnerDataId() {
        return 'owner@example.com'
      },
      async getAuthentication() {
        return {
          isAuthenticated: true,
          sessionStatus: 'active',
          userId: 'user_owner',
        }
      },
      async getUser() {
        return {
          id: 'user_owner',
          publicMetadata: { siteOwner: 'yes' },
        }
      },
    })

    await expect(authorize()).resolves.toEqual({
      status: 'authorized',
      principal: { id: 'owner@example.com', actorId: 'user_owner' },
    })
  })
})

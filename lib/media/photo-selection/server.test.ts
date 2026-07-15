import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPublishedSelection: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  unstable_cache: (callback: () => unknown) => callback,
}))
vi.mock('~/db', () => ({ getDatabase: vi.fn() }))
vi.mock('./repository', () => ({
  PUBLIC_PHOTO_SELECTION_CACHE_TAG: 'media:published-photo-selection',
  createPublicPhotoSelectionRepository: () => ({
    getPublishedSelection: mocks.getPublishedSelection,
  }),
}))
vi.mock('../storage/config', () => ({
  parseBunnyRenditionCdnEnv: () => new URL('https://media.example.com'),
}))

import { getPublishedPhotoSelection } from './server'

afterEach(() => {
  vi.clearAllMocks()
})

describe('Published Photo Selection server read', () => {
  it('returns the empty public state when the database is unavailable', async () => {
    mocks.getPublishedSelection.mockRejectedValueOnce(
      new Error('Database unavailable'),
    )

    await expect(getPublishedPhotoSelection()).resolves.toBeNull()
  })
})

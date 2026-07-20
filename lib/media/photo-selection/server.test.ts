import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPublishedSelection: vi.fn(),
}))

vi.mock('server-only', () => ({}))
// The 'use cache' directive is inert under Vitest, so the function body
// runs directly; cacheTag/cacheLife just need to be no-ops.
vi.mock('next/cache', () => ({
  cacheTag: () => undefined,
  cacheLife: () => undefined,
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
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('Published Photo Selection server read', () => {
  it('restores dates serialized by the cache', async () => {
    mocks.getPublishedSelection.mockResolvedValueOnce({
      revision: 'selection-1',
      publishedAt: '2026-07-15T09:00:00.000Z',
      count: 2,
      items: [
        {
          id: 'photo-1',
          width: 1600,
          height: 1200,
          altText: { zhHans: '海边', en: 'The coast' },
          renditions: [],
          capturedAt: '2026-07-14T08:30:00.000Z',
        },
        {
          id: 'photo-2',
          width: 1200,
          height: 1600,
          altText: { zhHans: '街道', en: 'A street' },
          renditions: [],
        },
      ],
    })

    const selection = await getPublishedPhotoSelection()

    expect(selection?.publishedAt).toEqual(
      new Date('2026-07-15T09:00:00.000Z'),
    )
    expect(selection?.publishedAt).toBeInstanceOf(Date)
    expect(selection?.items[0]?.capturedAt).toEqual(
      new Date('2026-07-14T08:30:00.000Z'),
    )
    expect(selection?.items[0]?.capturedAt).toBeInstanceOf(Date)
    expect(selection?.items[1]).not.toHaveProperty('capturedAt')
  })

  it('returns the empty public state when the database is unavailable', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.getPublishedSelection.mockRejectedValueOnce(
      new Error('Database unavailable'),
    )

    await expect(getPublishedPhotoSelection()).resolves.toBeNull()
    consoleError.mockRestore()
  })

  it('logs the swallowed error before rendering the empty state', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const failure = new Error('Database unavailable')
    mocks.getPublishedSelection.mockRejectedValueOnce(failure)

    await expect(getPublishedPhotoSelection()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      '[photo-selection] read failed; rendering empty state',
      failure,
    )
    consoleError.mockRestore()
  })

  it('rethrows from the cached read on Vercel so a deploy fails loudly, while the caller still renders the empty state at runtime', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const failure = new Error('Database unavailable')
    mocks.getPublishedSelection.mockRejectedValueOnce(failure)

    await expect(getPublishedPhotoSelection()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      '[photo-selection] public read failed; rendering empty state',
      failure,
    )
    consoleError.mockRestore()
  })
})

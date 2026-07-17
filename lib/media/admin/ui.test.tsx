// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clerk = vi.hoisted(() => ({
  verifyWithPasskey: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useSession: () => ({
    isLoaded: true,
    session: { id: 'sess_owner', verifyWithPasskey: clerk.verifyWithPasskey },
  }),
  useReverification: (fetcher: unknown) => fetcher,
}))

import { MediaLibrary } from '../../../app/admin/(protected)/media/MediaLibrary'
import type { MediaAssetReviewRecord } from '../asset-review/service'

const activeAsset: MediaAssetReviewRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: new Date('2026-07-15T12:00:00.000Z'),
  catalogState: 'active',
  processingState: 'ready',
  width: 4032,
  height: 3024,
  capturedAt: new Date('2025-05-08T00:31:34.000Z'),
  cameraMake: 'Google',
  cameraModel: 'Pixel 9 Pro',
  lens: null,
  focalLengthMillimeters: 6.9,
  aperture: 1.7,
  shutterSpeedSeconds: 0.01,
  iso: 80,
  hasCaptureLocation: true,
  locationLabelZhHans: '旧金山',
  locationLabelEn: 'San Francisco',
  focalPoint: { x: 0.4, y: 0.6 },
  altTextSuggestion: {
    zhHans: '一辆缆车沿着街道行驶。',
    en: 'A cable car travels along a city street.',
    model: 'gateway/model',
    suggestedAt: new Date('2026-07-15T12:00:00.000Z'),
  },
  altTextZhHans: null,
  altTextEn: null,
  altTextApprovedAt: null,
  archivedAt: null,
  previewRendition: {
    src: 'https://media.example.com/renditions/photo-640.jpg',
    width: 640,
    height: 480,
  },
}

const emptyDraft = {
  revision: 0,
  mediaAssetIds: [],
  updatedAt: null,
}

beforeEach(() => {
  clerk.verifyWithPasskey.mockResolvedValue({ status: 'complete' })
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    get length() {
      return entries.size
    },
    clear() {
      entries.clear()
    },
    getItem(key: string) {
      return entries.get(key) ?? null
    },
    removeItem(key: string) {
      entries.delete(key)
    },
    setItem(key: string, value: string) {
      entries.set(key, value)
    },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.locale
  clerk.verifyWithPasskey.mockReset()
})

describe('Media Library UI contract', () => {
  it('renders the batch, review, accessibility, and destructive controls', () => {
    const html = renderToStaticMarkup(
      <MediaLibrary
        initialActive={[activeAsset]}
        initialArchived={[]}
        initialDraft={emptyDraft}
      />,
    )

    expect(html).toContain('Drop JPEG, PNG, or HEIC files here')
    expect(html).toContain('multiple=""')
    expect(html).toContain('image/heic')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-label="设置焦点"')
    expect(html).toContain('use the arrow keys to adjust it')
    expect(html).toContain('Location Label (English)')
    expect(html).toContain('Alt Text Suggestion')
    expect(html).toContain('Approve Alt Text')
    expect(html).toContain('min-h-11')
    expect(html).not.toMatch(/latitude|longitude|originals\//i)
  })

  it('supports keyboard adjustment of the Focal Point', () => {
    const { container, getByRole } = render(
      <MediaLibrary
        initialActive={[activeAsset]}
        initialArchived={[]}
        initialDraft={emptyDraft}
      />,
    )

    fireEvent.keyDown(getByRole('button', { name: '设置焦点' }), {
      key: 'ArrowRight',
    })

    expect(
      container.querySelector<HTMLSpanElement>(
        'button[aria-label="设置焦点"] span[style]',
      )?.style.left,
    ).toBe('45%')
  })

  it('explains missing GPS metadata and keeps manual Location Labels available', () => {
    document.documentElement.dataset.locale = 'en'
    const withoutCaptureLocation = {
      ...activeAsset,
      hasCaptureLocation: false,
      locationLabelEn: null,
      locationLabelZhHans: null,
    }
    const { getByRole, getByText } = render(
      <MediaLibrary
        initialActive={[withoutCaptureLocation]}
        initialArchived={[]}
        initialDraft={emptyDraft}
      />,
    )

    expect(
      (
        getByRole('button', {
          name: /Suggest from Capture Location/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      getByText(
        'This file has no GPS Capture Location. Enter the label manually.',
      ),
    ).toBeTruthy()
    expect(
      (
        getByRole('textbox', {
          name: /Location Label \(English\)/,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(false)
  })

  it('adds a reviewed asset to the Draft from the same workspace', async () => {
    document.documentElement.dataset.locale = 'en'
    const eligibleAsset = {
      ...activeAsset,
      altTextZhHans: '一辆缆车沿着街道行驶。',
      altTextEn: 'A cable car travels along a city street.',
      altTextApprovedAt: new Date('2026-07-15T12:30:00.000Z'),
    }
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          mediaAssetIds: string[]
        }
        return Response.json({
          draft: {
            revision: 1,
            mediaAssetIds: request.mediaAssetIds,
            updatedAt: '2026-07-15T12:31:00.000Z',
          },
        })
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    const { getByRole } = render(
      <MediaLibrary
        initialActive={[eligibleAsset]}
        initialArchived={[]}
        initialDraft={emptyDraft}
      />,
    )

    fireEvent.click(getByRole('button', { name: /Add to Draft/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/media/photo-selection',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      expectedRevision: 0,
      mediaAssetIds: [eligibleAsset.id],
    })
    await waitFor(() =>
      expect(getByRole('link', { name: /In Draft/ })).toBeTruthy(),
    )
  })

  it('does not purge when passkey verification is cancelled', async () => {
    document.documentElement.dataset.locale = 'en'
    const archivedAsset: MediaAssetReviewRecord = {
      ...activeAsset,
      catalogState: 'archived',
      archivedAt: new Date('2026-07-15T13:00:00.000Z'),
    }
    vi.stubGlobal('prompt', vi.fn(() => 'PURGE'))
    clerk.verifyWithPasskey.mockRejectedValueOnce(
      new Error('passkey cancelled'),
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { getByRole } = render(
      <MediaLibrary
        initialActive={[]}
        initialArchived={[archivedAsset]}
        initialDraft={emptyDraft}
      />,
    )

    fireEvent.click(getByRole('tab', { name: /Archived/ }))
    fireEvent.click(getByRole('button', { name: /Purge permanently/ }))

    await waitFor(() => expect(clerk.verifyWithPasskey).toHaveBeenCalledOnce())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries a failed Original transfer before attempting completion', async () => {
    const digest = new Uint8Array(32).buffer
    vi.stubGlobal('crypto', {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
        .mockReturnValueOnce('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
      subtle: { digest: vi.fn().mockResolvedValue(digest) },
    })

    let originalAttempts = 0
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/admin/media/upload-intents') {
          return Response.json(
            {
              uploadIntent: {
                id: '22222222-2222-4222-8222-222222222222',
              },
            },
            { status: 201 },
          )
        }
        if (url.endsWith('/original')) {
          originalAttempts += 1
          return new Response(null, {
            status: originalAttempts === 1 ? 503 : 204,
          })
        }
        if (url.endsWith('/complete')) {
          return Response.json({
            mediaAsset: { id: activeAsset.id, processingState: 'ready' },
          })
        }
        if (url.endsWith('/alt-text')) {
          return Response.json({ suggestion: null })
        }
        if (url.endsWith('?view=active')) {
          return Response.json({ assets: [activeAsset] })
        }
        if (url.endsWith('?view=archived')) {
          return Response.json({ assets: [] })
        }
        throw new Error(`Unexpected request: ${url}`)
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    const { container, getByRole } = render(
      <MediaLibrary
        initialActive={[]}
        initialArchived={[]}
        initialDraft={emptyDraft}
      />,
    )
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', {
      type: 'image/jpeg',
    })
    if (!file.arrayBuffer) {
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new Uint8Array([1, 2, 3]).buffer,
      })
    }
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })

    await waitFor(() => expect(getByRole('button', { name: /Retry/ })).toBeTruthy())
    fireEvent.click(getByRole('button', { name: /Retry/ }))
    await waitFor(() => {
      expect(originalAttempts).toBe(2)
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/complete'))).toBe(true)
    })

    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.filter((url) => url === '/api/admin/media/upload-intents')).toHaveLength(1)
    expect(urls.filter((url) => url.endsWith('/original'))).toHaveLength(2)
    expect(urls.filter((url) => url.endsWith('/complete'))).toHaveLength(1)
    const intentBody = JSON.parse(
      String(fetchMock.mock.calls.find(([input]) =>
        String(input).endsWith('/upload-intents'),
      )?.[1]?.body),
    ) as { idempotencyKey: string }
    expect(intentBody.idempotencyKey).toBe(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    )
    expect(localStorage.length).toBe(0)
  })

  it('reuses an unfinished upload key after the admin remounts', async () => {
    const digest = new Uint8Array(32).buffer
    vi.stubGlobal('crypto', {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
        .mockReturnValueOnce('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
        .mockReturnValueOnce('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      subtle: { digest: vi.fn().mockResolvedValue(digest) },
    })
    const intentBodies: Array<{ idempotencyKey: string }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        intentBodies.push(JSON.parse(String(init?.body)))
        return Response.json({ error: 'dependency_unavailable' }, { status: 503 })
      }),
    )
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', {
      type: 'image/jpeg',
    })
    if (!file.arrayBuffer) {
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new Uint8Array([1, 2, 3]).buffer,
      })
    }

    const first = render(
      <MediaLibrary
        initialActive={[]}
        initialArchived={[]}
        initialDraft={emptyDraft}
      />,
    )
    fireEvent.change(first.container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    first.unmount()

    const second = render(
      <MediaLibrary
        initialActive={[]}
        initialArchived={[]}
        initialDraft={emptyDraft}
      />,
    )
    fireEvent.change(second.container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })
    await waitFor(() => expect(intentBodies).toHaveLength(2))
    expect(intentBodies.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ])
  })

  it('keeps a completed upload ready when the library refresh fails', async () => {
    const digest = new Uint8Array(32).buffer
    vi.stubGlobal('crypto', {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
        .mockReturnValueOnce('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
      subtle: { digest: vi.fn().mockResolvedValue(digest) },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/media/upload-intents') {
        return Response.json({
          uploadIntent: { id: '22222222-2222-4222-8222-222222222222' },
        })
      }
      if (url.endsWith('/original')) return new Response(null, { status: 204 })
      if (url.endsWith('/complete')) {
        return Response.json({
          mediaAsset: { id: activeAsset.id, processingState: 'ready' },
        })
      }
      if (url.endsWith('/alt-text')) return Response.json({ suggestion: null })
      if (url.includes('/api/admin/media/assets?view=')) {
        return Response.json({ error: 'dependency_unavailable' }, { status: 503 })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container, getByText, queryByRole } = render(
      <MediaLibrary
        initialActive={[]}
        initialArchived={[]}
        initialDraft={emptyDraft}
      />,
    )
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', {
      type: 'image/jpeg',
    })
    if (!file.arrayBuffer) {
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new Uint8Array([1, 2, 3]).buffer,
      })
    }
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })

    await waitFor(() => expect(getByText('Ready for review')).toBeTruthy())
    expect(queryByRole('button', { name: /Retry/ })).toBeNull()
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/complete')),
    ).toHaveLength(1)
  })
})

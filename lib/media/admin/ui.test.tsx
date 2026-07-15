// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MediaLibrary } from '../../../app/admin/(protected)/media/MediaLibrary'
import type { MediaAssetReviewRecord } from '../asset-review/service'

const activeAsset: MediaAssetReviewRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: new Date('2026-07-15T12:00:00.000Z'),
  lifecycle: 'active',
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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.locale
})

describe('Media Library UI contract', () => {
  it('renders the batch, review, accessibility, and destructive controls', () => {
    const html = renderToStaticMarkup(
      <MediaLibrary initialActive={[activeAsset]} initialArchived={[]} />,
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
      <MediaLibrary initialActive={[activeAsset]} initialArchived={[]} />,
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
        return new Response(null, { status: originalAttempts === 1 ? 503 : 204 })
      }
      if (url.endsWith('/complete')) {
        return Response.json({
          mediaAsset: { id: activeAsset.id, processingState: 'ready' },
        })
      }
      if (url.endsWith('/alt-text')) return Response.json({ suggestion: null })
      if (url.endsWith('?view=active')) {
        return Response.json({ assets: [activeAsset] })
      }
      if (url.endsWith('?view=archived')) return Response.json({ assets: [] })
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container, getByRole } = render(
      <MediaLibrary initialActive={[]} initialArchived={[]} />,
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
      <MediaLibrary initialActive={[]} initialArchived={[]} />,
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

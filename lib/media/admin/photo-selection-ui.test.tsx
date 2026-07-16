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

import { PhotoSelectionEditor } from '../../../app/admin/(protected)/photos/PhotoSelectionEditor'
import type { MediaAssetReviewRecord } from '../asset-review/service'

function asset(id: string, name: string): MediaAssetReviewRecord {
  return {
    id,
    createdAt: new Date('2026-07-15T12:00:00.000Z'),
    catalogState: 'active',
    processingState: 'ready',
    width: 1600,
    height: 1200,
    capturedAt: null,
    cameraMake: null,
    cameraModel: null,
    lens: null,
    focalLengthMillimeters: null,
    aperture: null,
    shutterSpeedSeconds: null,
    iso: null,
    locationLabelZhHans: null,
    locationLabelEn: name,
    focalPoint: { x: 0.4, y: 0.6 },
    altTextSuggestion: null,
    altTextZhHans: `${name} 的照片`,
    altTextEn: `A photo of ${name}`,
    altTextApprovedAt: new Date('2026-07-15T12:00:00.000Z'),
    archivedAt: null,
    previewRendition: {
      src: `https://media.example.com/${id}.jpg`,
      width: 640,
      height: 480,
    },
  }
}

const first = asset('11111111-1111-4111-8111-111111111111', 'First')
const second = asset('22222222-2222-4222-8222-222222222222', 'Second')
const third = asset('33333333-3333-4333-8333-333333333333', 'Third')
const fourth = asset('44444444-4444-4444-8444-444444444444', 'Fourth')

beforeEach(() => {
  clerk.verifyWithPasskey.mockResolvedValue({ status: 'complete' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.locale
  clerk.verifyWithPasskey.mockReset()
})

describe('Photo Selection admin UI contract', () => {
  it('renders autosaved curation, direct reorder, preview, and publish controls', () => {
    document.documentElement.dataset.locale = 'en'
    const html = renderToStaticMarkup(
      <PhotoSelectionEditor
        initialDraft={{
          revision: 2,
          mediaAssetIds: [first.id, second.id, third.id],
          updatedAt: new Date('2026-07-15T12:00:00.000Z'),
        }}
        initialAssets={[first, second, third, fourth]}
      />,
    )

    expect(html).toContain('Changes autosave to the Draft')
    expect(html).toContain('Homepage preview order')
    expect(html).toContain('draggable="true"')
    expect(html).toContain('aria-label="向前移动"')
    expect(html).toContain('aria-label="向后移动"')
    expect(html).toContain('Add to Draft')
    expect(html).toContain('Publish')
    expect(html).toContain('min-h-11')
    expect(html).not.toMatch(/latitude|longitude|originals\//i)
  })

  it('autosaves keyboard reorder with the current Draft revision', async () => {
    document.documentElement.dataset.locale = 'en'
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        mediaAssetIds: string[]
      }
      return Response.json({
        draft: {
          revision: 3,
          mediaAssetIds: request.mediaAssetIds,
          updatedAt: '2026-07-15T12:01:00.000Z',
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { getAllByRole } = render(
      <PhotoSelectionEditor
        initialDraft={{
          revision: 2,
          mediaAssetIds: [first.id, second.id],
          updatedAt: null,
        }}
        initialAssets={[first, second]}
      />,
    )

    fireEvent.click(getAllByRole('button', { name: 'Move later' })[0]!)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/media/photo-selection',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      expectedRevision: 2,
      mediaAssetIds: [second.id, first.id],
    })
  })

  it('ignores text dragged from outside the Photo Selection', () => {
    document.documentElement.dataset.locale = 'en'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(
      <PhotoSelectionEditor
        initialDraft={{
          revision: 2,
          mediaAssetIds: [first.id, second.id],
          updatedAt: null,
        }}
        initialAssets={[first, second]}
      />,
    )

    fireEvent.drop(container.querySelector('[draggable="true"]')!, {
      dataTransfer: { getData: () => 'https://example.com' },
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clears the dragged item when a drag is cancelled', () => {
    document.documentElement.dataset.locale = 'en'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { getAllByRole } = render(
      <PhotoSelectionEditor
        initialDraft={{
          revision: 2,
          mediaAssetIds: [first.id, second.id],
          updatedAt: null,
        }}
        initialAssets={[first, second]}
      />,
    )
    const dragButtons = getAllByRole('button', { name: /Drag/ })
    const dataTransfer = {
      effectAllowed: 'none',
      getData: () => first.id,
      setData: vi.fn(),
    }

    fireEvent.dragStart(dragButtons[0]!, { dataTransfer })
    fireEvent.dragEnd(dragButtons[0]!, { dataTransfer })
    fireEvent.drop(dragButtons[1]!.closest('li')!, { dataTransfer })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains failed publication without claiming the Draft was published', async () => {
    document.documentElement.dataset.locale = 'en'
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal('crypto', { randomUUID: () => 'publish_01' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'ineligible_assets' }, { status: 409 }),
      ),
    )
    const { getByRole, findByText } = render(
      <PhotoSelectionEditor
        initialDraft={{ revision: 2, mediaAssetIds: [first.id], updatedAt: null }}
        initialAssets={[first]}
      />,
    )

    fireEvent.click(getByRole('button', { name: /Publish/ }))

    expect(
      await findByText(/The Draft contains Media Assets that are no longer eligible/),
    ).toBeTruthy()
  })

  it('does not publish when passkey verification is cancelled', async () => {
    document.documentElement.dataset.locale = 'en'
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'publish_01') })
    clerk.verifyWithPasskey.mockRejectedValueOnce(
      new Error('passkey cancelled'),
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { getByRole } = render(
      <PhotoSelectionEditor
        initialDraft={{ revision: 2, mediaAssetIds: [first.id], updatedAt: null }}
        initialAssets={[first]}
      />,
    )

    fireEvent.click(getByRole('button', { name: /Publish/ }))

    await waitFor(() => expect(clerk.verifyWithPasskey).toHaveBeenCalledOnce())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reuses the publish key when cache refresh needs a safe retry', async () => {
    document.documentElement.dataset.locale = 'en'
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'publish_01') })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: 'cache_invalidation_failed' },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ publication: { status: 'published' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { getByRole, findByText } = render(
      <PhotoSelectionEditor
        initialDraft={{ revision: 2, mediaAssetIds: [first.id], updatedAt: null }}
        initialAssets={[first]}
      />,
    )
    const publish = getByRole('button', { name: /Publish/ })

    fireEvent.click(publish)
    expect(
      await findByText(/was published, but its public cache was not refreshed/),
    ).toBeTruthy()
    fireEvent.click(publish)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const requests = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)),
    )
    expect(requests).toEqual([
      { expectedDraftRevision: 2, idempotencyKey: 'publish_01' },
      { expectedDraftRevision: 2, idempotencyKey: 'publish_01' },
    ])
  })
})

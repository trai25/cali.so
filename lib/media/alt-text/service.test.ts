import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createMediaAltTextService,
  MediaAltTextError,
  type AltTextGenerationTarget,
  type AltTextSuggestionRecord,
} from './service'

const mediaAssetId = '11111111-1111-4111-8111-111111111111'
const imageBytes = new Uint8Array([255, 216, 255, 219, 0, 67, 0, 255, 217])
const checksumSha256 = createHash('sha256').update(imageBytes).digest('hex')
const now = new Date('2026-07-15T10:00:00.000Z')

const eligibleTarget: AltTextGenerationTarget = {
  mediaAssetId,
  catalogState: 'active',
  processingState: 'ready',
  rendition: {
    objectKey: `renditions/${mediaAssetId}/640-${checksumSha256}.jpg`,
    profileWidth: 640,
    checksumSha256,
    byteSize: imageBytes.byteLength,
    contentType: 'image/jpeg',
    metadataStripped: true,
  },
}

function createHarness(
  overrides: {
    target?: AltTextGenerationTarget | null
    rateLimitResult?: { success: boolean }
    readBytes?: Uint8Array
    generationError?: Error
    saveResult?: AltTextSuggestionRecord | null
  } = {},
) {
  const target =
    overrides.target === undefined ? eligibleTarget : overrides.target
  const saved: AltTextSuggestionRecord = {
    mediaAssetId,
    zhHans: '一辆红白相间的缆车沿城市街道行驶。',
    en: 'A red and white cable car travels along a city street.',
    model: 'google/gemini-3.1-flash-lite',
    suggestedAt: now,
  }
  const repository = {
    findGenerationTarget: vi.fn(async () => target),
    saveSuggestion: vi.fn(async () =>
      overrides.saveResult === undefined ? saved : overrides.saveResult,
    ),
  }
  const storage = {
    readRendition: vi.fn(async () => overrides.readBytes ?? imageBytes),
  }
  const generator = {
    generate: vi.fn(async () => {
      if (overrides.generationError) throw overrides.generationError
      return {
        zhHans: saved.zhHans,
        en: saved.en,
        model: saved.model,
      }
    }),
  }
  const rateLimiter = {
    limit: vi.fn(async () => overrides.rateLimitResult ?? { success: true }),
  }
  const service = createMediaAltTextService({
    repository,
    storage,
    generator,
    rateLimiter,
    clock: { now: () => now },
  })
  return { service, repository, storage, generator, rateLimiter, saved }
}

describe('Media Library Alt Text Suggestion service', () => {
  it('generates from only the bounded sanitized 640 Rendition', async () => {
    const harness = createHarness()

    await expect(
      harness.service.generateSuggestion({
        ownerUserId: 'user_owner',
        mediaAssetId,
      }),
    ).resolves.toEqual(harness.saved)

    expect(harness.storage.readRendition).toHaveBeenCalledWith(
      eligibleTarget.rendition!.objectKey,
    )
    expect(harness.generator.generate).toHaveBeenCalledWith({
      ownerUserId: 'user_owner',
      imageBytes,
    })
    expect(harness.repository.saveSuggestion).toHaveBeenCalledWith({
      ...harness.saved,
      ownerUserId: 'user_owner',
    })
    expect(JSON.stringify(harness.generator.generate.mock.calls)).not.toMatch(
      /original|filename|capture|location|metadata/i,
    )
  })

  it('rate limits before reading the Media Asset or Rendition', async () => {
    const harness = createHarness({ rateLimitResult: { success: false } })

    await expect(
      harness.service.generateSuggestion({
        ownerUserId: 'user_owner',
        mediaAssetId,
      }),
    ).rejects.toMatchObject({ code: 'rate_limited' })
    expect(harness.repository.findGenerationTarget).not.toHaveBeenCalled()
    expect(harness.storage.readRendition).not.toHaveBeenCalled()
  })

  it('rejects a non-ready or Archived Media Asset', async () => {
    const harness = createHarness({
      target: { ...eligibleTarget, catalogState: 'archived' },
    })

    await expect(
      harness.service.generateSuggestion({
        ownerUserId: 'user_owner',
        mediaAssetId,
      }),
    ).rejects.toMatchObject({ code: 'not_eligible' })
    expect(harness.generator.generate).not.toHaveBeenCalled()
  })

  it('verifies the stored Rendition checksum before AI processing', async () => {
    const harness = createHarness({ readBytes: new Uint8Array([1, 2, 3]) })

    await expect(
      harness.service.generateSuggestion({
        ownerUserId: 'user_owner',
        mediaAssetId,
      }),
    ).rejects.toMatchObject({ code: 'rendition_mismatch' })
    expect(harness.generator.generate).not.toHaveBeenCalled()
  })

  it('leaves the Media Asset unchanged when generation fails', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const harness = createHarness({
      generationError: new Error('provider down'),
    })

    await expect(
      harness.service.generateSuggestion({
        ownerUserId: 'user_owner',
        mediaAssetId,
      }),
    ).rejects.toEqual(new MediaAltTextError('generation_failed'))
    expect(harness.repository.saveSuggestion).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith(
      '[media-alt-text] Suggestion generation failed',
      new Error('provider down'),
    )
    consoleError.mockRestore()
  })

  it('does not save after the Media Asset becomes ineligible', async () => {
    const harness = createHarness({ saveResult: null })

    await expect(
      harness.service.generateSuggestion({
        ownerUserId: 'user_owner',
        mediaAssetId,
      }),
    ).rejects.toMatchObject({ code: 'not_eligible' })
  })

  it('rejects malformed owner and Media Asset identifiers', async () => {
    const harness = createHarness()

    await expect(
      harness.service.generateSuggestion({
        ownerUserId: ' user_owner ',
        mediaAssetId: 'asset-1',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
    expect(harness.rateLimiter.limit).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'

const { generateTextMock, gatewayMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  gatewayMock: vi.fn((model: string) => ({ model })),
}))

vi.mock('server-only', () => ({}))
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: generateTextMock,
  gateway: gatewayMock,
}))

import { altTextSuggestionSchema, createMediaAltTextGenerator } from './gateway'

const config = {
  primaryModel: 'openai/gpt-5.6-luna',
  fallbackModel: 'openai/gpt-5.4-mini',
  timeoutMs: 12_000,
  maxRetries: 1,
}

describe('Media Library AI Gateway Alt Text Suggestion generator', () => {
  it('uses structured output, model fallback, and privacy controls', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        zhHans: '一辆红白相间的缆车沿城市街道行驶。',
        en: 'A red and white cable car travels along a city street.',
      },
      response: { modelId: 'openai/gpt-5.4-mini' },
    })
    const bytes = new Uint8Array([255, 216, 255, 217])
    const generator = createMediaAltTextGenerator(config)

    await expect(
      generator.generate({ ownerUserId: 'user_owner', imageBytes: bytes }),
    ).resolves.toMatchObject({
      model: 'openai/gpt-5.4-mini',
      zhHans: expect.any(String),
      en: expect.any(String),
    })

    expect(gatewayMock).toHaveBeenCalledWith(config.primaryModel)
    const call = generateTextMock.mock.calls[0]![0]
    expect(call).toMatchObject({
      model: { model: config.primaryModel },
      maxOutputTokens: 2048,
      maxRetries: 1,
      timeout: 12_000,
      providerOptions: {
        gateway: {
          models: [config.fallbackModel],
          user: 'user_owner',
          tags: ['feature:media-alt-text'],
          zeroDataRetention: true,
          disallowPromptTraining: true,
        },
      },
    })
    const content = call.messages[0].content
    expect(content[1]).toEqual({
      type: 'file',
      data: bytes,
      mediaType: 'image/jpeg',
    })
    expect(call.temperature).toBeUndefined()
    expect(JSON.stringify(content)).not.toMatch(
      /IMG_|originals\/|latitude|longitude|EXIF/i,
    )
    expect(call.prompt).toBeUndefined()
  })

  it('bounds and validates both language suggestions', () => {
    expect(
      altTextSuggestionSchema.safeParse({
        zhHans: '城市街道上的缆车',
        en: 'A cable car',
      }).success,
    ).toBe(true)
    expect(
      altTextSuggestionSchema.safeParse({ zhHans: '描述', en: 'x'.repeat(281) })
        .success,
    ).toBe(false)
    expect(
      altTextSuggestionSchema.safeParse({
        zhHans: '描述',
        en: 'Description',
        gps: true,
      }).success,
    ).toBe(false)
  })
})

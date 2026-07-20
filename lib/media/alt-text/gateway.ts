import 'server-only'

import type { GatewayProviderOptions } from '@ai-sdk/gateway'
import { generateText, gateway, Output } from 'ai'
import { z } from 'zod'

import { MAX_ALT_TEXT_SUGGESTION_LENGTH } from './service'

export type MediaAltTextGatewayConfig = {
  primaryModel: string
  fallbackModel: string
  timeoutMs: number
  maxRetries: number
}

export const altTextSuggestionSchema = z
  .object({
    zhHans: z.string().trim().min(1).max(MAX_ALT_TEXT_SUGGESTION_LENGTH),
    en: z.string().trim().min(1).max(MAX_ALT_TEXT_SUGGESTION_LENGTH),
  })
  .strict()

const instructions = `Describe only what is visibly supported by the image for a website image alt attribute.
Return one concise Simplified Chinese description and one concise English description.
Keep each description under ${MAX_ALT_TEXT_SUGGESTION_LENGTH} characters.
Do not identify people, infer sensitive traits, guess a location, mention filenames or metadata, or begin with "image of", "photo of", "图片中", or "照片中".`

export function createMediaAltTextGenerator(config: MediaAltTextGatewayConfig) {
  return {
    async generate(input: { ownerUserId: string; imageBytes: Uint8Array }) {
      const result = await generateText({
        model: gateway(config.primaryModel),
        output: Output.object({
          schema: altTextSuggestionSchema,
          name: 'media_alt_text_suggestions',
          description:
            'Bounded Simplified Chinese and English Alt Text Suggestions',
        }),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: instructions },
              {
                type: 'image',
                image: input.imageBytes,
                mediaType: 'image/jpeg',
              },
            ],
          },
        ],
        temperature: 0.2,
        maxOutputTokens: 320,
        maxRetries: config.maxRetries,
        timeout: config.timeoutMs,
        providerOptions: {
          gateway: {
            models: [config.fallbackModel],
            user: input.ownerUserId,
            tags: ['feature:media-alt-text'],
            zeroDataRetention: true,
            disallowPromptTraining: true,
          } satisfies GatewayProviderOptions,
        },
      })

      return {
        ...result.output,
        model: result.response.modelId,
      }
    },
  }
}

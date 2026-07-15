import { z } from 'zod'

import type { MediaAltTextGatewayConfig } from './gateway'

export const DEFAULT_MEDIA_ALT_TEXT_PRIMARY_MODEL =
  'google/gemini-3.1-flash-lite'
export const DEFAULT_MEDIA_ALT_TEXT_FALLBACK_MODEL =
  'anthropic/claude-haiku-4.5'

const featureSwitch = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const modelId = z
  .string()
  .trim()
  .min(3)
  .max(255)
  .regex(/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/)

const schema = z
  .object({
    MEDIA_ALT_TEXT_ENABLED: featureSwitch,
    MEDIA_ALT_TEXT_PRIMARY_MODEL: modelId.default(
      DEFAULT_MEDIA_ALT_TEXT_PRIMARY_MODEL,
    ),
    MEDIA_ALT_TEXT_FALLBACK_MODEL: modelId.default(
      DEFAULT_MEDIA_ALT_TEXT_FALLBACK_MODEL,
    ),
    MEDIA_ALT_TEXT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .refine((value) => value === 12_000)
      .default(12_000),
    MEDIA_ALT_TEXT_MAX_RETRIES: z.coerce
      .number()
      .int()
      .refine((value) => value === 1)
      .default(1),
    MEDIA_ALT_TEXT_RATE_LIMIT_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .refine((value) => value === 10)
      .default(10),
    MEDIA_ALT_TEXT_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .refine((value) => value === 3_600)
      .default(3_600),
    MEDIA_ALT_TEXT_PROVIDER_POLICY_APPROVED: featureSwitch,
    AI_GATEWAY_API_KEY: z.string().trim().min(1).optional(),
    VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  })
  .superRefine((environment, context) => {
    const primaryProvider =
      environment.MEDIA_ALT_TEXT_PRIMARY_MODEL.split('/')[0]
    const fallbackProvider =
      environment.MEDIA_ALT_TEXT_FALLBACK_MODEL.split('/')[0]
    if (primaryProvider === fallbackProvider) {
      context.addIssue({
        code: 'custom',
        path: ['MEDIA_ALT_TEXT_FALLBACK_MODEL'],
        message: 'Alt Text Suggestion fallback must use another provider',
      })
    }
    if (
      environment.MEDIA_ALT_TEXT_ENABLED &&
      !environment.MEDIA_ALT_TEXT_PROVIDER_POLICY_APPROVED
    ) {
      context.addIssue({
        code: 'custom',
        path: ['MEDIA_ALT_TEXT_PROVIDER_POLICY_APPROVED'],
        message: 'AI provider policy approval is required before enablement',
      })
    }
    if (
      environment.VERCEL_ENV !== undefined &&
      environment.VERCEL_ENV !== 'development' &&
      environment.AI_GATEWAY_API_KEY
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AI_GATEWAY_API_KEY'],
        message: 'Deployed Media Alt Text must use Vercel OIDC',
      })
    }
  })
  .transform(
    (
      environment,
    ): MediaAltTextGatewayConfig & {
      enabled: boolean
      providerPolicyApproved: boolean
      rateLimitMaxRequests: number
      rateLimitWindowSeconds: number
    } => ({
      enabled: environment.MEDIA_ALT_TEXT_ENABLED,
      primaryModel: environment.MEDIA_ALT_TEXT_PRIMARY_MODEL,
      fallbackModel: environment.MEDIA_ALT_TEXT_FALLBACK_MODEL,
      timeoutMs: environment.MEDIA_ALT_TEXT_TIMEOUT_MS,
      maxRetries: environment.MEDIA_ALT_TEXT_MAX_RETRIES,
      rateLimitMaxRequests: environment.MEDIA_ALT_TEXT_RATE_LIMIT_MAX_REQUESTS,
      rateLimitWindowSeconds:
        environment.MEDIA_ALT_TEXT_RATE_LIMIT_WINDOW_SECONDS,
      providerPolicyApproved:
        environment.MEDIA_ALT_TEXT_PROVIDER_POLICY_APPROVED,
    }),
  )

export function parseMediaAltTextEnv(
  source: Record<string, string | undefined>,
) {
  const result = schema.safeParse(source)
  if (result.success) return result.data

  const fields = [
    ...new Set(
      result.error.issues.map((issue) => issue.path.join('.')).filter(Boolean),
    ),
  ]
  throw new Error(`Invalid Media Alt Text environment: ${fields.join(', ')}`)
}

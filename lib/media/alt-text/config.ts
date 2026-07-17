import { z } from 'zod'

import type { MediaAltTextGatewayConfig } from './gateway'

export const DEFAULT_MEDIA_ALT_TEXT_PRIMARY_MODEL =
  'openai/gpt-5.6-luna'
export const DEFAULT_MEDIA_ALT_TEXT_FALLBACK_MODEL =
  'openai/gpt-5.4-mini'

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
      .refine((value) => value === 12_000, {
        message: 'Must be 12000 (AI Gateway policy)',
      })
      .default(12_000),
    MEDIA_ALT_TEXT_MAX_RETRIES: z.coerce
      .number()
      .int()
      .refine((value) => value === 1, {
        message: 'Must be 1 (AI Gateway policy)',
      })
      .default(1),
    MEDIA_ALT_TEXT_RATE_LIMIT_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .refine((value) => value === 10, {
        message: 'Must be 10 (owner rate-limit policy)',
      })
      .default(10),
    MEDIA_ALT_TEXT_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .refine((value) => value === 3_600, {
        message: 'Must be 3600 (owner rate-limit policy)',
      })
      .default(3_600),
    MEDIA_ALT_TEXT_PROVIDER_POLICY_APPROVED: featureSwitch,
    AI_GATEWAY_API_KEY: z.string().trim().min(1).optional(),
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  })
  .superRefine((environment, context) => {
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
      (environment.NODE_ENV === 'production' ||
        (environment.VERCEL_ENV !== undefined &&
          environment.VERCEL_ENV !== 'development')) &&
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

  const details = [
    ...new Set(
      result.error.issues.map((issue) => {
        const field = issue.path.join('.')
        return field ? `${field}: ${issue.message}` : issue.message
      }),
    ),
  ]
  throw new Error(`Invalid Media Alt Text environment: ${details.join(', ')}`)
}

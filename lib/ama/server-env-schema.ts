import { z } from 'zod'

function isPostgresUrl(value: string) {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'postgres:' || protocol === 'postgresql:'
  } catch {
    return false
  }
}

function isBase64Key(value: string) {
  try {
    return Buffer.from(value, 'base64').length === 32
  } catch {
    return false
  }
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

const featureSwitch = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const amaFeatureEnvironmentSchema = z.object({
  AMA_PUBLIC_MUTATIONS_ENABLED: featureSwitch,
  AMA_PAYMENTS_ENABLED: featureSwitch,
  AMA_BOOKING_FINALIZATION_ENABLED: featureSwitch,
  AMA_GOOGLE_INTEGRATION_ENABLED: featureSwitch,
  AMA_TENCENT_INTEGRATION_ENABLED: featureSwitch,
})

function featureFlags({
  AMA_PUBLIC_MUTATIONS_ENABLED,
  AMA_PAYMENTS_ENABLED,
  AMA_BOOKING_FINALIZATION_ENABLED,
  AMA_GOOGLE_INTEGRATION_ENABLED,
  AMA_TENCENT_INTEGRATION_ENABLED,
}: z.output<typeof amaFeatureEnvironmentSchema>) {
  return {
    publicMutations: AMA_PUBLIC_MUTATIONS_ENABLED,
    payments: AMA_PAYMENTS_ENABLED,
    bookingFinalization: AMA_BOOKING_FINALIZATION_ENABLED,
    google: AMA_GOOGLE_INTEGRATION_ENABLED,
    tencent: AMA_TENCENT_INTEGRATION_ENABLED,
  }
}

function invalidEnvironmentError(error: z.ZodError) {
  const fields = [
    ...new Set(error.issues.map((issue) => issue.path.join('.')).filter(Boolean)),
  ]
  return new Error(`Invalid server environment: ${fields.join(', ')}`)
}

// Accepts a bare address or the display form `Name <address@domain>`.
function isSenderAddress(value: string) {
  const display = /^[^<>]*<([^<>]+)>$/.exec(value)
  const address = (display?.[1] ?? value).trim()
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)
}

const redisRestUrl = z.url().refine(isHttpsUrl)

// A blank placeholder line in an env file means "not configured", not an
// invalid credential, so empty values behave exactly like absent ones.
function blankAsUndefined<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema,
  )
}

const serverEnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().refine(isPostgresUrl),
    MIGRATION_DATABASE_URL: z.never().optional(),
    ADMIN_EMAIL: z.email().transform((value) => value.trim().toLowerCase()),
    AMA_ENCRYPTION_KEY: z.string().refine(isBase64Key),
    RATE_LIMIT_HASH_KEY: z.string().refine(isBase64Key),
    GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().trim().min(1).optional(),
    STRIPE_SECRET_KEY: blankAsUndefined(z.string().trim().min(1).optional()),
    STRIPE_WEBHOOK_SECRET: blankAsUndefined(z.string().trim().min(1).optional()),
    RESEND_API_KEY: blankAsUndefined(z.string().trim().min(1).optional()),
    AMA_EMAIL_FROM: blankAsUndefined(
      z
        .string()
        .trim()
        .min(3)
        .refine(isSenderAddress)
        .optional(),
    ),
    TENCENT_MEETING_MCP_URL: blankAsUndefined(z.url().refine(isHttpsUrl).optional()),
    TENCENT_MEETING_MCP_TOKEN: blankAsUndefined(z.string().trim().min(1).optional()),
    UPSTASH_REDIS_REST_URL: redisRestUrl.optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().trim().min(1).optional(),
    KV_REST_API_URL: redisRestUrl.optional(),
    KV_REST_API_TOKEN: z.string().trim().min(1).optional(),
    KV_REST_API_READ_ONLY_TOKEN: z.string().trim().min(1).optional(),
    KV_URL: z.string().trim().min(1).optional(),
    REDIS_URL: z.string().trim().min(1).optional(),
    VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
    SITE_URL: z
      .url()
      .refine((value) => {
        const url = new URL(value)
        return url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname)
      })
      .transform((value) => new URL(value)),
    ADMIN_MUTATION_RATE_LIMIT_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
    ADMIN_MUTATION_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    AMA_PUBLIC_RATE_LIMIT_MAX_REQUESTS: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    AMA_PUBLIC_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    ...amaFeatureEnvironmentSchema.shape,
  })
  .superRefine(
    (
      {
        UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN,
        KV_REST_API_URL,
        KV_REST_API_TOKEN,
        VERCEL_ENV,
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        AMA_GOOGLE_INTEGRATION_ENABLED,
        STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET,
        AMA_PAYMENTS_ENABLED,
        RESEND_API_KEY,
        AMA_EMAIL_FROM,
        AMA_BOOKING_FINALIZATION_ENABLED,
        TENCENT_MEETING_MCP_URL,
        TENCENT_MEETING_MCP_TOKEN,
        AMA_TENCENT_INTEGRATION_ENABLED,
      },
      context,
    ) => {
      const upstashPairComplete = Boolean(
        UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN,
      )
      const marketplacePairComplete = Boolean(
        KV_REST_API_URL && KV_REST_API_TOKEN,
      )
      if (
        VERCEL_ENV === 'production' &&
        Boolean(UPSTASH_REDIS_REST_URL) !== Boolean(UPSTASH_REDIS_REST_TOKEN)
      ) {
        context.addIssue({
          code: 'custom',
          path: [
            UPSTASH_REDIS_REST_URL
              ? 'UPSTASH_REDIS_REST_TOKEN'
              : 'UPSTASH_REDIS_REST_URL',
          ],
          message:
            'Upstash Redis credentials must be configured as a complete pair',
        })
      }

      if (
        VERCEL_ENV === 'production' &&
        Boolean(KV_REST_API_URL) !== Boolean(KV_REST_API_TOKEN)
      ) {
        context.addIssue({
          code: 'custom',
          path: [KV_REST_API_URL ? 'KV_REST_API_TOKEN' : 'KV_REST_API_URL'],
          message:
            'Vercel KV credentials must be configured as a complete pair',
        })
      }

      if (
        VERCEL_ENV === 'production' &&
        !upstashPairComplete &&
        !marketplacePairComplete
      ) {
        if (!UPSTASH_REDIS_REST_URL) {
          context.addIssue({
            code: 'custom',
            path: ['UPSTASH_REDIS_REST_URL'],
            message: 'A complete Redis credential pair is required',
          })
        }
        if (!UPSTASH_REDIS_REST_TOKEN) {
          context.addIssue({
            code: 'custom',
            path: ['UPSTASH_REDIS_REST_TOKEN'],
            message: 'A complete Redis credential pair is required',
          })
        }
      }

      if (AMA_GOOGLE_INTEGRATION_ENABLED && !GOOGLE_CLIENT_ID) {
        context.addIssue({
          code: 'custom',
          path: ['GOOGLE_CLIENT_ID'],
          message: 'Google OAuth client ID is required when Google is enabled',
        })
      }
      if (AMA_GOOGLE_INTEGRATION_ENABLED && !GOOGLE_CLIENT_SECRET) {
        context.addIssue({
          code: 'custom',
          path: ['GOOGLE_CLIENT_SECRET'],
          message:
            'Google OAuth client secret is required when Google is enabled',
        })
      }

      if (AMA_PAYMENTS_ENABLED && !STRIPE_SECRET_KEY) {
        context.addIssue({
          code: 'custom',
          path: ['STRIPE_SECRET_KEY'],
          message: 'Stripe secret key is required when payments are enabled',
        })
      }
      if (AMA_PAYMENTS_ENABLED && !STRIPE_WEBHOOK_SECRET) {
        context.addIssue({
          code: 'custom',
          path: ['STRIPE_WEBHOOK_SECRET'],
          message:
            'Stripe webhook signing secret is required when payments are enabled',
        })
      }
      if (AMA_BOOKING_FINALIZATION_ENABLED && !RESEND_API_KEY) {
        context.addIssue({
          code: 'custom',
          path: ['RESEND_API_KEY'],
          message:
            'Resend API key is required when booking finalization is enabled',
        })
      }
      if (AMA_BOOKING_FINALIZATION_ENABLED && !AMA_EMAIL_FROM) {
        context.addIssue({
          code: 'custom',
          path: ['AMA_EMAIL_FROM'],
          message:
            'AMA sender address is required when booking finalization is enabled',
        })
      }
      if (AMA_TENCENT_INTEGRATION_ENABLED && !TENCENT_MEETING_MCP_URL) {
        context.addIssue({
          code: 'custom',
          path: ['TENCENT_MEETING_MCP_URL'],
          message:
            'Tencent Meeting MCP URL is required when Tencent is enabled',
        })
      }
      if (AMA_TENCENT_INTEGRATION_ENABLED && !TENCENT_MEETING_MCP_TOKEN) {
        context.addIssue({
          code: 'custom',
          path: ['TENCENT_MEETING_MCP_TOKEN'],
          message:
            'Tencent Meeting MCP token is required when Tencent is enabled',
        })
      }
    },
  )
  .transform(
    ({
      UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN,
      KV_REST_API_URL,
      KV_REST_API_TOKEN,
      KV_REST_API_READ_ONLY_TOKEN: _kvReadOnlyToken,
      KV_URL: _kvUrl,
      REDIS_URL: _redisUrl,
      VERCEL_ENV,
      AMA_PUBLIC_MUTATIONS_ENABLED,
      AMA_PAYMENTS_ENABLED,
      AMA_BOOKING_FINALIZATION_ENABLED,
      AMA_GOOGLE_INTEGRATION_ENABLED,
      AMA_TENCENT_INTEGRATION_ENABLED,
      ...environment
    }) => ({
      ...environment,
      rateLimitBackend:
        VERCEL_ENV === 'production'
          ? {
              kind: 'upstash' as const,
              url: UPSTASH_REDIS_REST_URL ?? KV_REST_API_URL!,
              token: UPSTASH_REDIS_REST_TOKEN ?? KV_REST_API_TOKEN!,
            }
          : VERCEL_ENV === 'preview'
            ? { kind: 'database' as const }
            : { kind: 'memory' as const },
      features: featureFlags({
        AMA_PUBLIC_MUTATIONS_ENABLED,
        AMA_PAYMENTS_ENABLED,
        AMA_BOOKING_FINALIZATION_ENABLED,
        AMA_GOOGLE_INTEGRATION_ENABLED,
        AMA_TENCENT_INTEGRATION_ENABLED,
      }),
    }),
  )

export type ServerEnvironment = z.output<typeof serverEnvironmentSchema>

export function parseAmaFeatures(source: Record<string, string | undefined>) {
  const result = amaFeatureEnvironmentSchema.safeParse(source)
  if (result.success) return featureFlags(result.data)
  throw invalidEnvironmentError(result.error)
}

export function parseServerEnv(source: Record<string, string | undefined>) {
  const result = serverEnvironmentSchema.safeParse(source)
  if (result.success) return result.data
  throw invalidEnvironmentError(result.error)
}

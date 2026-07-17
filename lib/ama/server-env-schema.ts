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

function isVercelDeploymentHost(value: string) {
  try {
    const url = new URL(`https://${value}`)
    return (
      url.hostname === value &&
      url.hostname.endsWith('.vercel.app') &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    )
  } catch {
    return false
  }
}

function configured(value: string | undefined) {
  return typeof value === 'string' && value.trim() !== ''
}

type ProviderCredentialSource = {
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  RESEND_API_KEY?: string
  AMA_EMAIL_FROM?: string
  TENCENT_MEETING_MCP_URL?: string
  TENCENT_MEETING_MCP_TOKEN?: string
}

/**
 * AMA capabilities are enabled by default. Each provider-backed capability
 * derives its availability from whether that provider's credentials are
 * configured, so an environment without (say) Stripe still boots and its
 * payment routes fail closed instead of crashing.
 */
function featureFlags(source: ProviderCredentialSource) {
  return {
    publicMutations: true,
    payments:
      configured(source.STRIPE_SECRET_KEY) &&
      configured(source.STRIPE_WEBHOOK_SECRET),
    bookingFinalization:
      configured(source.RESEND_API_KEY) && configured(source.AMA_EMAIL_FROM),
    google:
      configured(source.GOOGLE_CLIENT_ID) &&
      configured(source.GOOGLE_CLIENT_SECRET),
    tencent:
      configured(source.TENCENT_MEETING_MCP_URL) &&
      configured(source.TENCENT_MEETING_MCP_TOKEN),
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
    GOOGLE_CLIENT_ID: blankAsUndefined(z.string().trim().min(1).optional()),
    GOOGLE_CLIENT_SECRET: blankAsUndefined(z.string().trim().min(1).optional()),
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
    VERCEL_URL: blankAsUndefined(
      z.string().trim().refine(isVercelDeploymentHost).optional(),
    ),
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
  })
  .superRefine(
    (
      {
        UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN,
        KV_REST_API_URL,
        KV_REST_API_TOKEN,
        VERCEL_ENV,
        VERCEL_URL,
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET,
        RESEND_API_KEY,
        AMA_EMAIL_FROM,
        TENCENT_MEETING_MCP_URL,
        TENCENT_MEETING_MCP_TOKEN,
      },
      context,
    ) => {
      if (VERCEL_ENV === 'preview' && !VERCEL_URL) {
        context.addIssue({
          code: 'custom',
          path: ['VERCEL_URL'],
          message: 'Vercel Preview requires its trusted deployment hostname',
        })
      }

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

      // Provider credentials arrive as complete pairs or not at all; a half
      // configured provider is a misconfiguration, not a disabled feature.
      const credentialPairs: Array<[string, string | undefined, string, string | undefined]> = [
        ['GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_SECRET', GOOGLE_CLIENT_SECRET],
        ['STRIPE_SECRET_KEY', STRIPE_SECRET_KEY, 'STRIPE_WEBHOOK_SECRET', STRIPE_WEBHOOK_SECRET],
        ['RESEND_API_KEY', RESEND_API_KEY, 'AMA_EMAIL_FROM', AMA_EMAIL_FROM],
        [
          'TENCENT_MEETING_MCP_URL',
          TENCENT_MEETING_MCP_URL,
          'TENCENT_MEETING_MCP_TOKEN',
          TENCENT_MEETING_MCP_TOKEN,
        ],
      ]
      for (const [firstName, first, secondName, second] of credentialPairs) {
        if (Boolean(first) !== Boolean(second)) {
          context.addIssue({
            code: 'custom',
            path: [first ? secondName : firstName],
            message: `${firstName} and ${secondName} must be configured together`,
          })
        }
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
      VERCEL_URL,
      ...environment
    }) => ({
      ...environment,
      browserMutationBaseUrl:
        VERCEL_ENV === 'preview'
          ? new URL(`https://${VERCEL_URL!}`)
          : environment.SITE_URL,
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
      features: featureFlags(environment),
    }),
  )

export type ServerEnvironment = z.output<typeof serverEnvironmentSchema>

export function parseAmaFeatures(source: Record<string, string | undefined>) {
  return featureFlags(source)
}

export function parseServerEnv(source: Record<string, string | undefined>) {
  const result = serverEnvironmentSchema.safeParse(source)
  if (result.success) return result.data
  throw invalidEnvironmentError(result.error)
}

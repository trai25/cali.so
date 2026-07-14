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

function isResendSender(value: string) {
  const bracketed = value.match(/^\s*[^<>]*<([^<>]+)>\s*$/)
  const mailbox = bracketed?.[1] ?? value.trim()
  return z.email().safeParse(mailbox).success
}

const serverEnvironmentSchema = z.object({
  DATABASE_URL: z.string().refine(isPostgresUrl),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(3).refine(isResendSender),
  ADMIN_EMAIL: z.email().transform((value) => value.trim().toLowerCase()),
  SESSION_SECRET: z.string().min(32),
  AMA_ENCRYPTION_KEY: z.string().refine(isBase64Key),
  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  SITE_URL: z
    .url()
    .refine((value) => {
      const url = new URL(value)
      return url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname)
    })
    .transform((value) => new URL(value)),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(5),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
})

export type ServerEnvironment = z.output<typeof serverEnvironmentSchema>

export function parseServerEnv(source: Record<string, string | undefined>) {
  const result = serverEnvironmentSchema.safeParse(source)
  if (result.success) return result.data

  const fields = [
    ...new Set(result.error.issues.map((issue) => issue.path.join('.')).filter(Boolean)),
  ]
  throw new Error(`Invalid server environment: ${fields.join(', ')}`)
}

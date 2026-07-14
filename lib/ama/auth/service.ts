import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const AUTH_SESSION_COOKIE = '__Host-cali_ama_admin_session'
export const MAGIC_LINK_LIFETIME_MS = 15 * 60 * 1000
export const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60

export type LoginTokenRecord = {
  tokenHash: string
  email: string
  expiresAt: Date
  consumedAt: Date | null
  createdAt: Date
}

export type AuthSessionRecord = {
  tokenHash: string
  email: string
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
}

export interface AuthRepository {
  createLoginToken(record: LoginTokenRecord): Promise<void>
  consumeLoginToken(tokenHash: string, ownerEmail: string, consumedAt: Date): Promise<boolean>
  createSession(record: AuthSessionRecord): Promise<void>
  findActiveSession(
    tokenHash: string,
    ownerEmail: string,
    checkedAt: Date,
  ): Promise<AuthSessionRecord | null>
  revokeSession(tokenHash: string, revokedAt: Date): Promise<void>
}

export interface AuthMailer {
  sendMagicLink(input: { to: string; url: URL; expiresAt: Date }): Promise<void>
}

export interface AuthRateLimiter {
  limit(key: string): Promise<{ success: boolean }>
}

type OwnerAuthDependencies = {
  ownerEmail: string
  sessionSecret: string
  baseUrl: URL
  repository: AuthRepository
  mailer: AuthMailer
  rateLimiter: AuthRateLimiter
  clock?: { now(): Date }
  randomToken?: () => string
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function sign(token: string, secret: string) {
  return createHmac('sha256', secret).update(token).digest('base64url')
}

function signaturesMatch(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

function sessionTokenFromCookie(cookieValue: string | undefined, secret: string) {
  if (!cookieValue) return null
  const parts = cookieValue.split('.')
  if (parts.length !== 2) return null
  const [token, signature] = parts
  if (!token || !signature || !signaturesMatch(signature, sign(token, secret))) return null
  return token
}

export function createOwnerAuth(dependencies: OwnerAuthDependencies) {
  const {
    repository,
    mailer,
    rateLimiter,
    baseUrl,
    sessionSecret,
    clock = { now: () => new Date() },
    randomToken = () => randomBytes(32).toString('base64url'),
  } = dependencies
  const ownerEmail = normalizeEmail(dependencies.ownerEmail)

  return {
    url(path: string) {
      return new URL(path, baseUrl)
    },

    async requestMagicLink(email: string, requestKey: string) {
      const limit = await rateLimiter.limit(requestKey)
      if (!limit.success || normalizeEmail(email) !== ownerEmail) return

      const now = clock.now()
      const expiresAt = new Date(now.getTime() + MAGIC_LINK_LIFETIME_MS)
      const token = randomToken()
      await repository.createLoginToken({
        tokenHash: hash(token),
        email: ownerEmail,
        expiresAt,
        consumedAt: null,
        createdAt: now,
      })

      const url = new URL('/api/admin/auth/verify', baseUrl)
      url.searchParams.set('token', token)
      await mailer.sendMagicLink({ to: ownerEmail, url, expiresAt })
    },

    async verifyMagicToken(token: string | null) {
      if (!token) return null
      const now = clock.now()
      const consumed = await repository.consumeLoginToken(hash(token), ownerEmail, now)
      if (!consumed) return null

      const sessionToken = randomToken()
      const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_SECONDS * 1000)
      await repository.createSession({
        tokenHash: hash(sessionToken),
        email: ownerEmail,
        expiresAt,
        revokedAt: null,
        createdAt: now,
      })

      return `${sessionToken}.${sign(sessionToken, sessionSecret)}`
    },

    async authenticate(cookieValue: string | undefined) {
      const sessionToken = sessionTokenFromCookie(cookieValue, sessionSecret)
      if (!sessionToken) return false
      return Boolean(
        await repository.findActiveSession(hash(sessionToken), ownerEmail, clock.now()),
      )
    },

    async logout(cookieValue: string | undefined) {
      const sessionToken = sessionTokenFromCookie(cookieValue, sessionSecret)
      if (!sessionToken) return
      await repository.revokeSession(hash(sessionToken), clock.now())
    },
  }
}

export type OwnerAuth = ReturnType<typeof createOwnerAuth>

import 'server-only'

import { createHmac } from 'node:crypto'

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { cookies } from 'next/headers'
import { Resend } from 'resend'

import { getServerEnv } from '~/lib/ama/server-env'

import { authRepository } from './repository'
import { AUTH_SESSION_COOKIE, createOwnerAuth } from './service'

let ownerAuth: ReturnType<typeof createOwnerAuth> | undefined

export function getOwnerAuth() {
  if (ownerAuth) return ownerAuth

  const environment = getServerEnv()
  const resend = new Resend(environment.RESEND_API_KEY)
  const redis = new Redis({
    url: environment.UPSTASH_REDIS_REST_URL,
    token: environment.UPSTASH_REDIS_REST_TOKEN,
  })
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      environment.AUTH_RATE_LIMIT_MAX_REQUESTS,
      `${environment.AUTH_RATE_LIMIT_WINDOW_SECONDS} s`,
    ),
    prefix: 'cali:ama:owner-auth',
  })
  const limiterKey = createHmac(
    'sha256',
    Buffer.from(environment.RATE_LIMIT_HASH_KEY, 'base64'),
  )
    .update('ama-auth-rate-limit')
    .digest()

  ownerAuth = createOwnerAuth({
    ownerEmail: environment.ADMIN_EMAIL,
    sessionSecret: environment.SESSION_SECRET,
    baseUrl: environment.SITE_URL,
    repository: authRepository,
    rateLimiter: {
      limit(key) {
        const privateKey = createHmac('sha256', limiterKey).update(key).digest('hex')
        return limiter.limit(privateKey)
      },
    },
    mailer: {
      async sendMagicLink({ to, url }) {
        const result = await resend.emails.send({
          from: environment.RESEND_FROM_EMAIL,
          to,
          subject: 'Sign in to AMA admin',
          text: [
            'Use this private link to sign in to AMA admin:',
            '',
            url.toString(),
            '',
            'The link expires in 15 minutes and works once.',
          ].join('\n'),
        })
        if (result.error) throw new Error('Magic-link delivery failed')
      },
    },
  })

  return ownerAuth
}

export async function isOwnerAuthenticated() {
  if (!getServerEnv().features.admin) return false
  const cookieStore = await cookies()
  return getOwnerAuth().authenticate(cookieStore.get(AUTH_SESSION_COOKIE)?.value)
}

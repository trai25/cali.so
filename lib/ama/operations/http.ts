import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

import type { OperationsRunResult } from './runner'

const headers = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers })
}

function equalSecret(actual: string, expected: string) {
  const actualDigest = createHash('sha256').update(actual).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(actualDigest, expectedDigest)
}

/**
 * The authenticated scheduled endpoint driving AMA durable work: expired
 * Slot Holds are swept, then due operations run under leases. Only Vercel
 * Cron holds the bearer secret.
 */
export function createAmaWorkHandler({
  cronSecret,
  getWork,
}: {
  cronSecret: string | undefined
  getWork(): {
    releaseExpiredHolds(): Promise<number>
    runOperations(): Promise<OperationsRunResult>
  }
}) {
  return async function GET(request: Request) {
    if (!cronSecret) return response(503, { error: 'feature_disabled' })
    const authorization = request.headers.get('authorization')
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : ''
    if (!bearer || !equalSecret(bearer, cronSecret)) {
      return response(401, { error: 'unauthorized' })
    }
    try {
      const work = getWork()
      const releasedHolds = await work.releaseExpiredHolds()
      const operations = await work.runOperations()
      return response(200, { work: { releasedHolds, operations } })
    } catch {
      return response(503, { error: 'dependency_unavailable' })
    }
  }
}

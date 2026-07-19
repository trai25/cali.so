import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

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

export function createMediaReconciliationHandler({
  cronSecret,
  getReconciliation,
}: {
  cronSecret: string | undefined
  getReconciliation(): { run(): Promise<unknown> }
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
      const reconciliation = getReconciliation()
      return response(200, { reconciliation: await reconciliation.run() })
    } catch {
      return response(503, { error: 'dependency_unavailable' })
    }
  }
}

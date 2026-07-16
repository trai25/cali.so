import 'server-only'

import { reverificationErrorResponse } from '@clerk/nextjs/server'

export const HIGH_IMPACT_REVERIFICATION = {
  level: 'first_factor',
  afterMinutes: 10,
} as const

export type OwnerReverifier = {
  verify(request: Request): Promise<Response | null>
}

export function createOwnerReverifier({
  hasFreshFirstFactor,
}: {
  hasFreshFirstFactor(
    requirement: typeof HIGH_IMPACT_REVERIFICATION,
  ): Promise<boolean>
}): OwnerReverifier {
  return {
    async verify(_request) {
      if (await hasFreshFirstFactor(HIGH_IMPACT_REVERIFICATION)) return null
      const response = reverificationErrorResponse(
        HIGH_IMPACT_REVERIFICATION,
      )
      const headers = new Headers(response.headers)
      headers.set('cache-control', 'no-store')
      headers.set('content-type', 'application/json; charset=utf-8')
      headers.set('referrer-policy', 'no-referrer')
      headers.set('x-content-type-options', 'nosniff')
      return new Response(response.body, {
        status: response.status,
        headers,
      })
    },
  }
}

import { describe, expect, it } from 'vitest'

import { checkBrowserMutationRequest } from './request-policy'

const canonicalOrigin = new URL('https://cali.so')

function mutationRequest(headers: HeadersInit = {}) {
  return new Request('https://cali.so/api/admin/ama/availability', {
    method: 'POST',
    headers,
  })
}

describe('browser mutation request policy', () => {
  it('accepts an exact same-origin browser request', () => {
    expect(
      checkBrowserMutationRequest(
        mutationRequest({ origin: 'https://cali.so', 'sec-fetch-site': 'same-origin' }),
        canonicalOrigin,
      ),
    ).toBeNull()
  })

  it.each([
    [{ 'sec-fetch-site': 'same-origin' }, 'missing-origin'],
    [{ origin: 'null', 'sec-fetch-site': 'same-origin' }, 'origin-mismatch'],
    [
      { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' },
      'origin-mismatch',
    ],
    [{ origin: 'http://cali.so', 'sec-fetch-site': 'same-origin' }, 'origin-mismatch'],
    [{ origin: 'https://cali.so:444', 'sec-fetch-site': 'same-origin' }, 'origin-mismatch'],
    [{ origin: 'https://cali.so' }, 'missing-fetch-metadata'],
    [{ origin: 'https://cali.so', 'sec-fetch-site': 'same-site' }, 'cross-site-context'],
    [{ origin: 'https://cali.so', 'sec-fetch-site': 'cross-site' }, 'cross-site-context'],
    [{ origin: 'https://cali.so', 'sec-fetch-site': 'none' }, 'cross-site-context'],
  ] as const)('rejects unsafe browser context %#', (headers, reason) => {
    expect(checkBrowserMutationRequest(mutationRequest(headers), canonicalOrigin)).toBe(
      reason,
    )
  })
})

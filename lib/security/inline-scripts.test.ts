import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { adminContentSecurityPolicy } from './headers'
import { PREPAINT_SCRIPT } from './inline-scripts'

describe('hashed inline scripts', () => {
  it('allows only the owned pre-paint bootstrap by hash', () => {
    const hash = `'sha256-${createHash('sha256')
      .update(PREPAINT_SCRIPT)
      .digest('base64')}'`
    expect(adminContentSecurityPolicy('test-nonce')).toContain(hash)
  })
})

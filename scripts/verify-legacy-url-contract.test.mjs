import assert from 'node:assert/strict'
import test from 'node:test'

import {
  validatedProbeUrl,
  visibleDocumentText,
} from './verify-legacy-url-contract.mjs'

test('accepts only normalized same-origin manifest probes', () => {
  const baseUrl = 'https://staging.example.com'

  assert.equal(
    validatedProbeUrl(baseUrl, '/en/blog/a-post?source=manifest').href,
    'https://staging.example.com/en/blog/a-post?source=manifest',
  )

  for (const probe of [
    'https://attacker.example/path',
    '//attacker.example/path',
    '/\\attacker.example/path',
    '/blog/../admin',
    '/blog#fragment',
  ]) {
    assert.throws(() => validatedProbeUrl(baseUrl, probe))
  }
})

test('extracts visible document text without regex-based HTML filtering', () => {
  const html = `
    <main>Confirmation retired</main>
    <script >manifest-secret</script >
    <style>.manifest-secret { color: red }</style>
    <template>manifest-secret</template>
    <noscript>manifest-secret</noscript>
  `

  assert.match(visibleDocumentText(html), /Confirmation retired/)
  assert.doesNotMatch(visibleDocumentText(html), /manifest-secret/)
})

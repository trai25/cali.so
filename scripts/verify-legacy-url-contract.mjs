import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { JSDOM } from 'jsdom'

import { openProductionServer } from './production-server.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function validateManifest(manifest) {
  assert.equal(manifest.version, 1)
  assert.ok(Array.isArray(manifest.entries))

  const probes = new Set()
  for (const entry of manifest.entries) {
    assert.equal(typeof entry.source, 'string')
    assert.match(entry.source, /^\/(?!\/)/)
    assert.ok(Array.isArray(entry.probes) && entry.probes.length > 0)
    assert.ok([200, 308].includes(entry.status))
    assert.equal(typeof entry.contains, entry.kind === 'redirect' ? 'undefined' : 'string')
    if (entry.kind === 'redirect' || entry.kind === 'rewrite') {
      assert.equal(typeof entry.destination, 'string')
    }
    for (const probe of entry.probes) {
      validatedProbeUrl('https://manifest.invalid', probe)
      assert.ok(!probes.has(probe), `duplicate manifest probe: ${probe}`)
      probes.add(probe)
    }
    for (const forbidden of entry.forbids ?? []) assert.equal(typeof forbidden, 'string')
  }

  return probes
}

async function validateBlogCoverage(probes) {
  const contentRoot = path.join(root, 'content/blog')
  const directories = await readdir(contentRoot, { withFileTypes: true })
  for (const directory of directories) {
    if (!directory.isDirectory()) continue
    for (const prefix of ['', '/en']) {
      const route = `${prefix}/blog/${directory.name}`
      assert.ok(probes.has(route), `manifest is missing ${route}`)
    }
  }
}

function expectedLocation(baseUrl, destination) {
  return new URL(destination, baseUrl).href
}

export function validatedProbeUrl(baseUrl, probe) {
  assert.equal(typeof probe, 'string')
  assert.match(probe, /^\/(?!\/)/, `probe must be a same-origin path: ${probe}`)
  assert.ok(!probe.includes('\\'), `probe must not contain backslashes: ${probe}`)

  const url = new URL(probe, baseUrl)
  assert.equal(url.origin, new URL(baseUrl).origin, `probe changed origin: ${probe}`)
  assert.equal(url.hash, '', `probe must not contain a fragment: ${probe}`)
  assert.equal(`${url.pathname}${url.search}`, probe, `probe must be normalized: ${probe}`)

  return url
}

export function visibleDocumentText(html) {
  const dom = new JSDOM(html)

  try {
    const document = dom.window.document
    for (const element of document.querySelectorAll('script, style, template, noscript')) {
      element.remove()
    }
    return document.body?.textContent ?? ''
  } finally {
    dom.window.close()
  }
}

async function verifyEntry(baseUrl, entry, probe) {
  const probeUrl = validatedProbeUrl(baseUrl, probe)
  // codeql[js/file-access-to-http] -- Normalized same-origin probes only.
  const response = await fetch(probeUrl, { redirect: 'manual' })
  assert.equal(response.status, entry.status, `${probe} status`)

  if (entry.kind === 'redirect') {
    const location = response.headers.get('location')
    assert.ok(location, `${probe} needs a Location header`)
    assert.equal(
      expectedLocation(baseUrl, location),
      expectedLocation(baseUrl, entry.destination),
      `${probe} location`,
    )
    return
  }

  const body = await response.text()
  assert.ok(
    body.includes(entry.contains),
    `${probe} is missing ${JSON.stringify(entry.contains)}`,
  )
  const visibleDocument = visibleDocumentText(body)
  for (const forbidden of entry.forbids ?? []) {
    assert.ok(
      !visibleDocument.includes(forbidden),
      `${probe} exposed forbidden request data`,
    )
  }
  if (entry.kind === 'feed' || entry.kind === 'rewrite') {
    assert.match(
      response.headers.get('content-type') ?? '',
      /(?:application|text)\/xml/,
    )
  }
}

async function main() {
  const manifest = JSON.parse(
    await readFile(path.join(root, 'content/legacy-url-manifest.json'), 'utf8'),
  )
  const probes = validateManifest(manifest)
  await validateBlogCoverage(probes)

  const externalBaseUrl = process.env.LEGACY_URL_BASE_URL
  const server = await openProductionServer(externalBaseUrl)
  const { baseUrl } = server

  try {
    for (const entry of manifest.entries) {
      for (const probe of entry.probes) await verifyEntry(baseUrl, entry, probe)
    }
    console.log(`Verified ${probes.size} legacy URL probes against ${baseUrl}`)
  } finally {
    await server.stop()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

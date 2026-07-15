import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { openProductionServer } from './production-server.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(
  await readFile(path.join(root, 'content/legacy-url-manifest.json'), 'utf8'),
)

function validateManifest() {
  assert.equal(manifest.version, 1)
  assert.ok(Array.isArray(manifest.entries))

  const probes = new Set()
  for (const entry of manifest.entries) {
    assert.match(entry.source, /^\//)
    assert.ok(Array.isArray(entry.probes) && entry.probes.length > 0)
    assert.ok([200, 308].includes(entry.status))
    if (entry.kind === 'redirect' || entry.kind === 'rewrite') {
      assert.equal(typeof entry.destination, 'string')
    }
    for (const probe of entry.probes) {
      assert.ok(!probes.has(probe), `duplicate manifest probe: ${probe}`)
      probes.add(probe)
    }
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

async function verifyEntry(baseUrl, entry, probe) {
  const response = await fetch(new URL(probe, baseUrl), { redirect: 'manual' })
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
  const visibleDocument = body.replace(
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    '',
  )
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

const probes = validateManifest()
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

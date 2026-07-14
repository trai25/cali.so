import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

async function openPort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return address.port
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child?.exitCode !== null)
      throw new Error(`Next.js exited with code ${child.exitCode}`)
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' })
      if (response.status > 0) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${baseUrl}`)
}

async function startProductionServer() {
  const buildId = path.join(root, '.next/BUILD_ID')
  await readFile(buildId, 'utf8').catch(() => {
    throw new Error('Run pnpm build before pnpm verify:legacy-urls')
  })

  const port = await openPort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))

  try {
    await waitForServer(baseUrl, child)
  } catch (error) {
    child.kill('SIGTERM')
    throw new Error(`${error.message}\n${output}`)
  }

  return {
    baseUrl,
    stop: async () => {
      child.kill('SIGTERM')
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5_000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    },
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
const server = externalBaseUrl ? null : await startProductionServer()
const baseUrl = externalBaseUrl ?? server.baseUrl

try {
  for (const entry of manifest.entries) {
    for (const probe of entry.probes) await verifyEntry(baseUrl, entry, probe)
  }
  console.log(`Verified ${probes.size} legacy URL probes against ${baseUrl}`)
} finally {
  await server?.stop()
}

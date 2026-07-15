import { createHash, randomUUID } from 'node:crypto'

import { chromium, type Browser, type Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { BunnyStorageError, createBunnyStorage } from './bunny'
import { parseBunnyStorageEnv } from './config'
import {
  assertNonProductionBunnyContract,
  verifyBunnyAccountContract,
} from './contract'
import { storeOriginalFromSameOriginRequest } from './upload'

const liveContractEnabled =
  process.env.BUNNY_STORAGE_LIVE_TEST === 'confirmed-non-production'

const liveDescribe = liveContractEnabled ? describe : describe.skip

async function pageAtOrigin(
  browser: Browser,
  origin: string,
  uploadUrl: string,
  handleUpload: (request: Request) => Promise<Response>,
) {
  const page = await browser.newPage()
  const contractPage = `${origin}/__bunny_storage_contract__`
  await page.route(contractPage, async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Bunny storage contract</title>',
    })
  })
  await page.route(uploadUrl, async (route) => {
    const browserRequest = route.request()
    const headers = await browserRequest.allHeaders()
    // Playwright omits Fetch Metadata from intercepted requests, so restore
    // the value the browser derives from this contract page and upload URL.
    headers['sec-fetch-site'] =
      new URL(origin).origin === new URL(uploadUrl).origin
        ? 'same-origin'
        : 'cross-site'
    const body = browserRequest.postDataBuffer()
    const response = await handleUpload(
      new Request(uploadUrl, {
        method: browserRequest.method(),
        headers,
        body: body ? Uint8Array.from(body) : undefined,
      }),
    )
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    })
  })
  await page.goto(contractPage)
  return page
}

async function uploadFromBrowser(
  page: Page,
  uploadUrl: string,
  bytes: Uint8Array,
  checksumSha256: string,
) {
  return page.evaluate(
    async ({ url, body, checksum }) => {
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'content-type': 'image/jpeg',
            'x-media-checksum-sha256': checksum,
          },
          body: Uint8Array.from(body),
        })
        return { blocked: false, ok: response.ok, status: response.status }
      } catch {
        return { blocked: true, ok: false, status: 0 }
      }
    },
    { url: uploadUrl, body: Array.from(bytes), checksum: checksumSha256 },
  )
}

liveDescribe('Bunny Media Storage browser contract', () => {
  it(
    'accepts the same-origin server upload and blocks a cross-site browser',
    async () => {
      const config = parseBunnyStorageEnv(process.env)
      const contract = assertNonProductionBunnyContract(process.env, config)
      await verifyBunnyAccountContract(config, contract)
      const storage = createBunnyStorage(config)
      const identity = randomUUID()
      const bytes = new TextEncoder().encode(`bunny-browser-contract:${identity}`)
      const checksumSha256 = createHash('sha256').update(bytes).digest('hex')
      const allowedKey = `contracts/${identity}/allowed-origin.jpg`
      const attackerKey = `contracts/${identity}/attacker-origin.jpg`
      const uploadUrl = `${contract.origin.origin}/__bunny_storage_contract__/upload`
      let browser: Browser | undefined

      try {
        browser = await chromium.launch()
        const allowedPage = await pageAtOrigin(
          browser,
          contract.origin.origin,
          uploadUrl,
          (request) =>
            storeOriginalFromSameOriginRequest({
              request,
              canonicalBaseUrl: contract.origin,
              expectation: {
                key: allowedKey,
                contentType: 'image/jpeg',
                byteSize: bytes.byteLength,
                checksumSha256,
              },
              authorize: async () => true,
              storage,
            }),
        )
        await expect(
          uploadFromBrowser(allowedPage, uploadUrl, bytes, checksumSha256),
        ).resolves.toEqual({ blocked: false, ok: true, status: 204 })
        await expect(storage.readOriginal(allowedKey)).resolves.toEqual(bytes)

        const attackerPage = await pageAtOrigin(
          browser,
          'https://attacker.example',
          uploadUrl,
          (request) =>
            storeOriginalFromSameOriginRequest({
              request,
              canonicalBaseUrl: contract.origin,
              expectation: {
                key: attackerKey,
                contentType: 'image/jpeg',
                byteSize: bytes.byteLength,
                checksumSha256,
              },
              authorize: async () => true,
              storage,
            }),
        )
        await expect(
          uploadFromBrowser(attackerPage, uploadUrl, bytes, checksumSha256),
        ).resolves.toEqual({ blocked: false, ok: false, status: 403 })
        await expect(storage.inspectOriginal(attackerKey)).rejects.toEqual(
          new BunnyStorageError('not_found'),
        )
      } finally {
        await browser?.close()
        await Promise.allSettled([
          storage.deleteOriginal(allowedKey),
          storage.deleteOriginal(attackerKey),
        ])
      }
    },
    45_000,
  )
})

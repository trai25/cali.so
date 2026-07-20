import { createHash, randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { BunnyStorageError, createBunnyStorage } from './bunny'
import { parseBunnyStorageEnv } from './config'
import {
  assertNonProductionBunnyContract,
  renditionDeliveryHeadersMatchContract,
  verifyBunnyAccountContract,
} from './contract'

const liveContractEnabled =
  process.env.BUNNY_STORAGE_LIVE_TEST === 'confirmed-non-production'

const liveDescribe = liveContractEnabled ? describe : describe.skip

async function waitFor(
  assertion: () => Promise<boolean>,
  timeoutMilliseconds = 15_000,
) {
  const deadline = Date.now() + timeoutMilliseconds
  while (Date.now() < deadline) {
    if (await assertion()) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Bunny contract condition did not become observable in time')
}

liveDescribe('Bunny Media Storage live contract', () => {
  it(
    'blocks Original paths and delivers Renditions from one Media zone',
    async () => {
      const config = parseBunnyStorageEnv(process.env)
      const contract = assertNonProductionBunnyContract(process.env, config)
      await verifyBunnyAccountContract(config, contract)
      const storage = createBunnyStorage(config)
      const identity = randomUUID()
      const originalKey = `originals/contracts/${identity}/original.jpg`
      const bytes = new TextEncoder().encode(`bunny-media-contract:${identity}`)
      const checksumSha256 = createHash('sha256').update(bytes).digest('hex')
      const renditionKey =
        `renditions/contracts/${identity}/rendition-${checksumSha256}.jpg`
      const chunkKey = `transfer-chunks/${originalKey}/0.part`
      const publicOriginalUrl = new URL(
        originalKey,
        config.media.cdnBaseUrl,
      )
      const publicChunkUrl = new URL(chunkKey, config.media.cdnBaseUrl)

      try {
        await storage.storeOriginal({
          key: originalKey,
          bytes,
          contentType: 'image/jpeg',
          checksumSha256,
        })

        await expect(storage.inspectOriginal(originalKey)).resolves.toMatchObject({
          byteSize: bytes.byteLength,
          contentType: 'image/jpeg',
        })
        await expect(storage.readOriginal(originalKey)).resolves.toEqual(bytes)
        await storage.storeOriginalChunk({
          originalKey,
          chunkIndex: 0,
          bytes,
          checksumSha256,
        })

        const [originalResponse, chunkResponse] = await Promise.all([
          fetch(publicOriginalUrl, { cache: 'no-store' }),
          fetch(publicChunkUrl, { cache: 'no-store' }),
        ])
        expect(originalResponse.status).toBe(403)
        expect(chunkResponse.status).toBe(403)
        expect(await originalResponse.text()).not.toContain(identity)
        expect(await chunkResponse.text()).not.toContain(identity)

        const publicUrl = await storage.storeRendition({
          key: renditionKey,
          bytes,
          checksumSha256,
          contentType: 'image/jpeg',
        })
        await expect(storage.inspectRendition(renditionKey)).resolves.toMatchObject({
          byteSize: bytes.byteLength,
          contentType: 'image/jpeg',
        })
        await waitFor(async () => {
          const response = await fetch(publicUrl)
          return response.ok && response.headers.get('content-type') === 'image/jpeg'
        })
        await waitFor(async () => {
          const response = await fetch(publicUrl)
          return renditionDeliveryHeadersMatchContract(
            response.headers,
            contract.browserTtlSeconds,
          )
        })

        await storage.deleteRendition(renditionKey)
        await storage.purgeRendition(renditionKey)
        await waitFor(async () => {
          const response = await fetch(publicUrl, { cache: 'no-store' })
          return !response.ok
        })

        await storage.deleteOriginal(originalKey)
        await expect(storage.inspectOriginal(originalKey)).rejects.toEqual(
          new BunnyStorageError('not_found'),
        )
      } finally {
        await Promise.allSettled([
          storage.deleteRendition(renditionKey),
          storage.purgeRendition(renditionKey),
          storage.deleteOriginal(originalKey),
          storage.deleteOriginalChunk(originalKey, 0),
        ])
      }
    },
    45_000,
  )
})

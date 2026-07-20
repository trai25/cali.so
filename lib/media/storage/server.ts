import 'server-only'

import { createBunnyStorage } from './bunny'
import { parseBunnyStorageEnv } from './config'

let storage: ReturnType<typeof createBunnyStorage> | undefined

export function getMediaStorage() {
  storage ??= createBunnyStorage(parseBunnyStorageEnv(process.env))
  return storage
}

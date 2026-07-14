import 'server-only'

import { parseServerEnv, type ServerEnvironment } from './server-env-schema'

let environment: ServerEnvironment | undefined

export function getServerEnv() {
  environment ??= parseServerEnv(process.env)
  return environment
}

import 'server-only'

import {
  parseAmaFeatures,
  parseServerEnv,
  type ServerEnvironment,
} from './server-env-schema'

let environment: ServerEnvironment | undefined
let features: ReturnType<typeof parseAmaFeatures> | undefined

export function getAmaFeatures() {
  features ??= parseAmaFeatures(process.env)
  return features
}

export function getServerEnv() {
  environment ??= parseServerEnv(process.env)
  return environment
}

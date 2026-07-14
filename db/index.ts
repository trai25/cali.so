import 'server-only'

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

import { getServerEnv } from '~/lib/ama/server-env'

let database: ReturnType<typeof createDatabase> | undefined

function createDatabase() {
  const sql = neon(getServerEnv().DATABASE_URL)
  return drizzle({ client: sql })
}

export function getDatabase() {
  database ??= createDatabase()
  return database
}

import 'server-only'

import { attachDatabasePool } from '@vercel/functions'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { getServerEnv } from '~/lib/ama/server-env'

let database: ReturnType<typeof createDatabase> | undefined

function createDatabase() {
  const pool = new Pool({ connectionString: getServerEnv().DATABASE_URL })
  attachDatabasePool(pool)
  return drizzle({ client: pool })
}

export function getDatabase() {
  database ??= createDatabase()
  return database
}

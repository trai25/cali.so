import { after } from 'next/server'

import { createMagicLinkRequestHandler } from '~/lib/ama/auth/http'
import { getOwnerAuth } from '~/lib/ama/auth/server'

export async function POST(request: Request) {
  return createMagicLinkRequestHandler(getOwnerAuth(), (task) => after(task))(request)
}

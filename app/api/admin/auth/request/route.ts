import { after } from 'next/server'

import { createMagicLinkRequestHandler } from '~/lib/ama/auth/http'
import { getOwnerAuth } from '~/lib/ama/auth/server'
import { getAmaSecurity } from '~/lib/ama/security/server'

export async function POST(request: Request) {
  return createMagicLinkRequestHandler(
    getOwnerAuth(),
    getAmaSecurity(),
    (task) => after(task),
  )(request)
}

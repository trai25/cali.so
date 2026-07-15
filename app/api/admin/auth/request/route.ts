import { after } from 'next/server'

import { createMagicLinkRequestHandler } from '~/lib/ama/auth/http'
import { getOwnerAuth } from '~/lib/ama/auth/server'
import { protectAmaLaunchBoundary } from '~/lib/ama/security/launch-boundary-server'
import { getAmaSecurity } from '~/lib/ama/security/server'

export async function POST(request: Request) {
  const blocked = protectAmaLaunchBoundary(request, ['admin'])
  if (blocked) return blocked
  return createMagicLinkRequestHandler(
    getOwnerAuth(),
    getAmaSecurity(),
    (task) => after(task),
  )(request)
}

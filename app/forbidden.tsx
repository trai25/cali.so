import type { Metadata } from 'next'
import { nonPublicRobots } from '~/lib/non-public-metadata'

import { ForbiddenPageView } from './_views/forbidden-page'

export const metadata: Metadata = {
  title: 'Forbidden',
  robots: nonPublicRobots,
}

export default function Forbidden() {
  return <ForbiddenPageView />
}

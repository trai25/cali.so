import type { Metadata } from 'next'

import { ForbiddenPageView } from './_views/forbidden-page'

export const metadata: Metadata = {
  title: 'Forbidden',
  robots: { index: false, follow: false },
}

export default function Forbidden() {
  return <ForbiddenPageView />
}

import 'server-only'

import { notFound } from 'next/navigation'

import { getAmaFeatures } from '../server-env'

export function requireAmaAdminEnabled() {
  if (!getAmaFeatures().admin) notFound()
}

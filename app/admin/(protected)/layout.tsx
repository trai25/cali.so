import { redirect } from 'next/navigation'

import { requireAmaAdminEnabled } from '~/lib/ama/admin/launch-boundary-server'
import { isOwnerAuthenticated } from '~/lib/ama/auth/server'

import { AdminShell } from './AdminShell'

// Owner authentication must be evaluated for every request.
export const instant = false

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  requireAmaAdminEnabled()
  if (!(await isOwnerAuthenticated())) redirect('/admin/login')
  return <AdminShell>{children}</AdminShell>
}

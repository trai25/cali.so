import { requireOwnerPage } from '~/lib/admin/server'

import { AdminShell } from './AdminShell'

// Owner authentication must be evaluated for every request.
export const instant = false

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPage('/admin')
  return <AdminShell>{children}</AdminShell>
}

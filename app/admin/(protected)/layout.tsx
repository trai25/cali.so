import { redirect } from 'next/navigation'

import { isOwnerAuthenticated } from '~/lib/ama/auth/server'

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isOwnerAuthenticated())) redirect('/admin/login')
  return children
}

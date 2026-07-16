import { redirect } from 'next/navigation'

import { requireOwnerPage } from '~/lib/admin/server'

export default async function AdminLoginRedirectPage() {
  await requireOwnerPage('/admin')
  redirect('/admin')
}

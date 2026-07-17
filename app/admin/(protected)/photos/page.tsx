import { permanentRedirect } from 'next/navigation'

export default async function AdminPhotosPage() {
  permanentRedirect('/admin/media#publish')
}

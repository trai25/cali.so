import { amaManageMetadata, AmaManagePageView } from '../../../../_views/ama-manage-page'

export const metadata = amaManageMetadata('zh')

// An arbitrary private token cannot produce a reusable route shell during
// prerendering, mirroring the legacy /confirm/[token] route.
export const instant = false

export default async function ChineseAmaManagePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <AmaManagePageView token={token} />
}

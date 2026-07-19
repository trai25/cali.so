import { createMediaReconciliationHandler } from '~/lib/media/reconciliation/http'
import { getMediaAdminServices } from '~/lib/media/admin/server'

export const maxDuration = 60

export async function GET(request: Request) {
  return createMediaReconciliationHandler({
    cronSecret: process.env.CRON_SECRET,
    getReconciliation: () => getMediaAdminServices().reconciliation,
  })(request)
}

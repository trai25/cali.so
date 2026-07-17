import { createAmaWorkHandler } from '~/lib/ama/operations/http'
import { getAmaBookingServices } from '~/lib/ama/booking/server'

export const maxDuration = 60

export async function GET(request: Request) {
  return createAmaWorkHandler({
    cronSecret: process.env.CRON_SECRET,
    getWork: () => {
      const { claims, runner } = getAmaBookingServices()
      return {
        releaseExpiredHolds: () => claims.releaseExpiredHolds(new Date()),
        runOperations: () => runner.run(),
      }
    },
  })(request)
}

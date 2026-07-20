import { createManageStateHandler } from '~/lib/ama/booking/http'
import { getAmaBookingServices } from '~/lib/ama/booking/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const { manage } = getAmaBookingServices()
  return createManageStateHandler({ manage })(request, token)
}

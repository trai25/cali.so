import { createStripeWebhookHandler, json } from '~/lib/ama/booking/http'
import { getAmaBookingServices } from '~/lib/ama/booking/server'
import { protectAmaLaunchBoundary } from '~/lib/ama/security/launch-boundary-server'

export async function POST(request: Request) {
  const blocked = protectAmaLaunchBoundary(request, ['payments'])
  if (blocked) return blocked
  const { booking, stripeWebhookSecret } = getAmaBookingServices()
  if (!stripeWebhookSecret) return json(503, { error: 'feature_disabled' })
  return createStripeWebhookHandler({
    service: booking,
    signingSecret: stripeWebhookSecret,
  })(request)
}

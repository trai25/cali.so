export const AMA_SESSION_PRICE = Object.freeze({
  /** Stripe minor units: US$99.00. */
  amount: 9900,
  currency: 'usd',
})

export const AMA_HOLD_LIFETIME_MINUTES = 15

/**
 * Stripe requires a Checkout Session to live at least 30 minutes, so a
 * payment can legitimately finish after the Slot Hold expired. The webhook
 * handles that through the explicit late-payment conflict path.
 */
export const AMA_CHECKOUT_LIFETIME_MINUTES = 30

/** Guests may reschedule or cancel with refund until this cutoff. */
export const AMA_MANAGE_CUTOFF_MINUTES = 24 * 60

/** Booking Brief text and URLs are purged this long after the session. */
export const AMA_BRIEF_RETENTION_DAYS = 90

export const AMA_TOPICS = Object.freeze([
  'engineering',
  'product-design',
  'ai-workflows',
  'career',
  'indie-business',
  'team-leadership',
  'something-else',
] as const)

export type AmaTopic = (typeof AMA_TOPICS)[number]

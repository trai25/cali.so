/**
 * Full-page navigation behind one seam. jsdom cannot stub
 * `window.location.assign` directly (the Location object is sealed), so
 * flows that hand off to Stripe Checkout or route across pages go through
 * this helper, which tests replace with `vi.mock`.
 */
export function assignLocation(url: string) {
  window.location.assign(url)
}

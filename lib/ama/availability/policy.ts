export const AMA_BOOKING_POLICY = Object.freeze({
  sessionMinutes: 60,
  minimumNoticeMinutes: 24 * 60,
  horizonDays: 30,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  // Offer starts on the half hour while keeping 60-minute sessions flexible.
  startCadenceMinutes: 30,
})

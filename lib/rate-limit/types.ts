export type RateLimitPolicy = {
  prefix: string
  maxRequests: number
  windowSeconds: number
}

export type Clock = {
  now(): Date
}

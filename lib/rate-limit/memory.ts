type RateLimitPolicy = {
  prefix: string
  maxRequests: number
  windowSeconds: number
}

type Clock = {
  now(): Date
}

type Window = {
  requestCount: number
  expiresAt: number
}

export function createMemoryRateLimiter(
  policy: RateLimitPolicy,
  clock: Clock = { now: () => new Date() },
) {
  const windows = new Map<string, Window>()

  return {
    async limit(key: string) {
      const now = clock.now().getTime()
      const current = windows.get(key)
      const window =
        !current || current.expiresAt <= now
          ? {
              requestCount: 1,
              expiresAt: now + policy.windowSeconds * 1_000,
            }
          : {
              requestCount: current.requestCount + 1,
              expiresAt: current.expiresAt,
            }

      windows.set(key, window)
      return { success: window.requestCount <= policy.maxRequests }
    },
  }
}

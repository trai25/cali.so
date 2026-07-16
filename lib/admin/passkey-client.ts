'use client'

import { useSession } from '@clerk/nextjs'
import { useCallback } from 'react'

type AsyncFetcher<Arguments extends unknown[], Result> = (
  ...args: Arguments
) => Promise<Result>

export class PasskeyVerificationError extends Error {
  constructor() {
    super('passkey_verification_failed')
    this.name = 'PasskeyVerificationError'
  }
}

function isReverificationHint(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const clerkError = (value as { clerk_error?: unknown }).clerk_error
  return (
    Boolean(clerkError) &&
    typeof clerkError === 'object' &&
    (clerkError as { reason?: unknown }).reason === 'reverification-error'
  )
}

export async function isReverificationResponse(response: Response) {
  if (response.status !== 403) return false
  try {
    return isReverificationHint(await response.clone().json())
  } catch {
    return false
  }
}

export function usePasskeyVerification() {
  const { isLoaded, session } = useSession()

  return useCallback(async () => {
    if (!isLoaded || !session) {
      throw new PasskeyVerificationError()
    }
    try {
      const verification = await session.verifyWithPasskey()
      if (verification.status !== 'complete') {
        throw new PasskeyVerificationError()
      }
    } catch (error) {
      if (error instanceof PasskeyVerificationError) throw error
      throw new PasskeyVerificationError()
    }
  }, [isLoaded, session])
}

export function usePasskeyReverification<
  Arguments extends unknown[],
  Result,
>(fetcher: AsyncFetcher<Arguments, Result>) {
  const verifyWithPasskey = usePasskeyVerification()

  return useCallback(
    async (...args: Arguments) => {
      await verifyWithPasskey()
      const result = await fetcher(...args)
      const denied =
        result instanceof Response
          ? await isReverificationResponse(result)
          : isReverificationHint(result)
      if (denied) throw new PasskeyVerificationError()
      return result
    },
    [fetcher, verifyWithPasskey],
  )
}

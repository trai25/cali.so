'use client'

import { useReverification, useSession } from '@clerk/nextjs'
import { isReverificationCancelledError } from '@clerk/nextjs/errors'
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
  const reverifyingFetcher = useReverification(fetcher, {
    onNeedsReverification({ cancel, complete, level }) {
      if (level !== 'first_factor') {
        cancel()
        return
      }
      void verifyWithPasskey().then(complete, () => cancel())
    },
  })

  return useCallback(
    async (...args: Arguments) => {
      await verifyWithPasskey()
      let result: Awaited<Result>
      try {
        result = await reverifyingFetcher(...args)
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          throw new PasskeyVerificationError()
        }
        throw error
      }
      if (isReverificationHint(result)) throw new PasskeyVerificationError()
      return result
    },
    [reverifyingFetcher, verifyWithPasskey],
  )
}

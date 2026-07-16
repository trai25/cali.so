// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const clerk = vi.hoisted(() => ({
  session: {
    id: 'sess_owner',
    verifyWithPasskey: vi.fn(),
  },
}))

vi.mock('@clerk/nextjs', () => ({
  useSession: () => ({ isLoaded: true, session: clerk.session }),
  useReverification: (
    fetcher: (...args: unknown[]) => Promise<unknown>,
    options: {
      onNeedsReverification(input: {
        cancel(): void
        complete(): void
        level: 'first_factor'
      }): void
    },
  ) =>
    async (...args: unknown[]) => {
      const first = await fetcher(...args)
      if (!(first instanceof Response) || first.status !== 403) return first
      const body = (await first.clone().json()) as {
        clerk_error?: { reason?: string }
      }
      if (body.clerk_error?.reason !== 'reverification-error') return first

      await new Promise<void>((resolve, reject) => {
        options.onNeedsReverification({
          level: 'first_factor',
          complete: resolve,
          cancel: () => reject(new Error('reverification_cancelled')),
        })
      })
      const retry = await fetcher(...args)
      return retry instanceof Response ? retry.json() : retry
    },
}))

vi.mock('@clerk/nextjs/errors', () => ({
  isReverificationCancelledError: (error: unknown) =>
    error instanceof Error && error.message === 'reverification_cancelled',
}))

import { usePasskeyReverification } from './passkey-client'

afterEach(() => {
  cleanup()
  clerk.session.verifyWithPasskey.mockReset()
})

describe('passkey-first client reverification', () => {
  it('sends no mutation when the owner cancels the passkey prompt', async () => {
    clerk.session.verifyWithPasskey.mockRejectedValueOnce(
      new Error('passkey cancelled'),
    )
    const mutation = vi.fn(async () => ({ ok: true }))
    const { result } = renderHook(() => usePasskeyReverification(mutation))

    await expect(
      act(async () => result.current()),
    ).rejects.toThrow('passkey_verification_failed')
    expect(mutation).not.toHaveBeenCalled()
  })

  it('sends the mutation only after a successful passkey assertion', async () => {
    clerk.session.verifyWithPasskey.mockResolvedValueOnce({ status: 'complete' })
    const mutation = vi.fn(async () => ({ ok: true }))
    const { result } = renderHook(() => usePasskeyReverification(mutation))

    await act(async () => {
      await expect(result.current()).resolves.toEqual({ ok: true })
    })

    expect(clerk.session.verifyWithPasskey).toHaveBeenCalledOnce()
    expect(mutation).toHaveBeenCalledOnce()
  })

  it('retries a server reverification denial only after another passkey succeeds', async () => {
    clerk.session.verifyWithPasskey
      .mockResolvedValueOnce({ status: 'complete' })
      .mockResolvedValueOnce({ status: 'complete' })
    const mutation = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            clerk_error: {
              type: 'forbidden',
              reason: 'reverification-error',
              metadata: {
                reverification: {
                  level: 'first_factor',
                  afterMinutes: 10,
                },
              },
            },
          },
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(() => usePasskeyReverification(mutation))

    await act(async () => {
      await expect(result.current()).resolves.toEqual({ ok: true })
    })

    expect(clerk.session.verifyWithPasskey).toHaveBeenCalledTimes(2)
    expect(mutation).toHaveBeenCalledTimes(2)
  })

  it('does not retry when the second passkey prompt is cancelled', async () => {
    clerk.session.verifyWithPasskey
      .mockResolvedValueOnce({ status: 'complete' })
      .mockRejectedValueOnce(new Error('passkey cancelled'))
    const mutation = vi.fn(async () =>
      Response.json(
        {
          clerk_error: {
            type: 'forbidden',
            reason: 'reverification-error',
            metadata: {
              reverification: {
                level: 'first_factor',
                afterMinutes: 10,
              },
            },
          },
        },
        { status: 403 },
      ),
    )
    const { result } = renderHook(() => usePasskeyReverification(mutation))

    await expect(
      act(async () => result.current()),
    ).rejects.toThrow('passkey_verification_failed')
    expect(mutation).toHaveBeenCalledOnce()
  })

  it('preserves non-cancellation operation errors', async () => {
    clerk.session.verifyWithPasskey.mockResolvedValueOnce({ status: 'complete' })
    const mutation = vi.fn(async () => {
      throw new Error('dependency_unavailable')
    })
    const { result } = renderHook(() => usePasskeyReverification(mutation))

    await expect(
      act(async () => result.current()),
    ).rejects.toThrow('dependency_unavailable')
    expect(mutation).toHaveBeenCalledOnce()
  })

  it('does not report success when the retry remains denied', async () => {
    clerk.session.verifyWithPasskey
      .mockResolvedValueOnce({ status: 'complete' })
      .mockResolvedValueOnce({ status: 'complete' })
    const denied = () =>
      Response.json(
        {
          clerk_error: {
            type: 'forbidden',
            reason: 'reverification-error',
            metadata: {
              reverification: {
                level: 'first_factor',
                afterMinutes: 10,
              },
            },
          },
        },
        { status: 403 },
      )
    const mutation = vi.fn(async () => denied())
    const { result } = renderHook(() => usePasskeyReverification(mutation))

    await expect(
      act(async () => result.current()),
    ).rejects.toThrow('passkey_verification_failed')
    expect(mutation).toHaveBeenCalledTimes(2)
  })
})

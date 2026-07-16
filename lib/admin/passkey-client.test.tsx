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

  it('does not prompt or retry automatically after a server freshness denial', async () => {
    clerk.session.verifyWithPasskey.mockResolvedValueOnce({ status: 'complete' })
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
    expect(clerk.session.verifyWithPasskey).toHaveBeenCalledOnce()
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

})

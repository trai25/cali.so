import 'server-only'

import {
  RetryableOperationError,
  TerminalOperationError,
  type OperationHandler,
} from './handlers'
import type { DurableOperationsRepository } from './repository'

const BASE_RETRY_SECONDS = 30
const MAX_RETRY_SECONDS = 3600

export type OperationsRunResult = {
  claimed: number
  succeeded: number
  retried: number
  failed: number
  deferred: number
}

type OperationsRunnerDependencies = {
  operations: DurableOperationsRepository
  handler: OperationHandler
  clock?: { now(): Date }
  leaseSeconds?: number
  batchSize?: number
  /**
   * Soft wall-clock budget for one run. Every provider call can take up to
   * its own timeout, so an unbounded batch could outlive the hosting
   * function's maxDuration; work not started before the budget is spent
   * stays leased and is reclaimed by the next run once the lease expires.
   */
  timeBudgetMs?: number
}

function backoffAt(attemptCount: number, now: Date) {
  const seconds = Math.min(
    BASE_RETRY_SECONDS * 2 ** Math.max(0, attemptCount - 1),
    MAX_RETRY_SECONDS,
  )
  return new Date(now.getTime() + seconds * 1000)
}

/**
 * Drains due durable work under leases. Each operation is claimed with a
 * lease token, executed once, and either completed, re-queued with bounded
 * backoff, or parked in the terminal failed state. An interrupted worker's
 * lease simply expires and the next run reclaims the work.
 */
export function createOperationsRunner(dependencies: OperationsRunnerDependencies) {
  const {
    operations,
    handler,
    clock = { now: () => new Date() },
    leaseSeconds = 120,
    batchSize = 10,
    timeBudgetMs = 45_000,
  } = dependencies

  return {
    async run(): Promise<OperationsRunResult> {
      const startedAtMs = clock.now().getTime()
      const claimed = await operations.claimDue({
        now: clock.now(),
        leaseSeconds,
        limit: batchSize,
      })
      const result: OperationsRunResult = {
        claimed: claimed.length,
        succeeded: 0,
        retried: 0,
        failed: 0,
        deferred: 0,
      }
      for (const operation of claimed) {
        if (!operation.leaseToken) continue
        if (clock.now().getTime() - startedAtMs >= timeBudgetMs) {
          result.deferred += 1
          continue
        }
        try {
          await handler(operation)
          await operations.complete(operation.id, operation.leaseToken, clock.now())
          result.succeeded += 1
        } catch (error) {
          const now = clock.now()
          const terminal = error instanceof TerminalOperationError
          const retryAt =
            error instanceof RetryableOperationError && error.retryAt
              ? error.retryAt
              : backoffAt(operation.attemptCount, now)
          const errorCode =
            error instanceof RetryableOperationError ||
            error instanceof TerminalOperationError
              ? error.code
              : 'unexpected_error'
          const failed = await operations.fail({
            operationId: operation.id,
            leaseToken: operation.leaseToken,
            errorCode,
            retryAt,
            now,
            terminal,
          })
          if (failed?.status === 'failed') result.failed += 1
          else result.retried += 1
        }
      }
      return result
    },
  }
}

export type OperationsRunner = ReturnType<typeof createOperationsRunner>

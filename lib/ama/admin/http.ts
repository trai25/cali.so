import type {
  OwnerAccess,
  OwnerPrincipal,
} from '~/lib/admin/authorization'

import { securityDenialHeaders } from '../security/request-policy'
import type { AmaFeature, AmaSecurity } from '../security/service'

export interface OwnerRequestAuthenticator {
  authenticate(request: Request): Promise<OwnerAccess>
}

export type AvailabilityWindowInput = {
  isoWeekday: number
  startMinute: number
  endMinute: number
}

export interface AvailabilityMutationService {
  setTimeZone(timeZone: string): Promise<unknown>
  setWeekday(isoWeekday: number, enabled: boolean): Promise<unknown>
  copyWeekday(
    sourceWeekday: number,
    targetWeekdays: readonly number[],
  ): Promise<unknown>
  replaceWeekday(
    isoWeekday: number,
    intervals: readonly { startMinute: number; endMinute: number }[],
  ): Promise<unknown>
  saveOverride(
    localDate: string,
    intervals: readonly { startMinute: number; endMinute: number }[],
  ): Promise<unknown>
  deleteOverride(localDate: string): Promise<unknown>
  create(input: AvailabilityWindowInput): Promise<unknown>
  update(id: number, input: AvailabilityWindowInput): Promise<unknown>
  delete(id: number): Promise<unknown>
}

export type GoogleCallbackResult =
  | 'connected'
  | 'denied-scope'
  | 'expired'
  | 'revoked'
  | 'unavailable'

export interface AdminGoogleService {
  begin(): Promise<URL>
  complete(input: {
    state: string | null
    code: string | null
    error: string | null
  }): Promise<GoogleCallbackResult>
  disconnect(): Promise<void>
}

type HandlerDependencies<T> = {
  authenticator: OwnerRequestAuthenticator
  service: T
  security: AmaSecurity
  baseUrl: URL
}

type AdminRequestMode = 'browser-mutation' | 'provider-callback'

function redirect(baseUrl: URL, pathOrUrl: string | URL) {
  const location = pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, baseUrl)
  return new Response(null, {
    status: 303,
    headers: {
      location: location.toString(),
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  })
}

async function enforceAdminRequestPolicy(
  dependencies: HandlerDependencies<unknown>,
  request: Request,
  mode: AdminRequestMode,
  requiredFeatures?: readonly AmaFeature[],
) {
  const { authenticator, security } = dependencies
  const blocked = mode === 'browser-mutation'
    ? requiredFeatures
      ? await security.protectBrowserMutation(request, requiredFeatures)
      : await security.protectOwnerAdminMutation(request)
    : security.protectFeatures(request, requiredFeatures ?? [])
  if (blocked) return blocked

  let access: OwnerAccess
  try {
    access = await authenticator.authenticate(request)
  } catch {
    return new Response(null, {
      status: 503,
      headers: securityDenialHeaders(),
    })
  }
  if (access.status !== 'authorized') {
    security.recordAuthenticationDenial(request)
    return new Response(null, {
      status: access.status === 'forbidden' ? 403 : 401,
      headers: securityDenialHeaders(),
    })
  }

  const limited = await security.limitAdminMutation(
    request,
    access.principal.actorId,
  )
  if (limited) return limited
  return access.principal
}

function denied(result: Response | OwnerPrincipal): result is Response {
  return result instanceof Response
}

function formString(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function formStrings(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === 'string')
}

function parsePositiveInteger(value: string) {
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function parseMinute(value: string, allowEndOfDay = false) {
  if (allowEndOfDay && value === '24:00') return 24 * 60
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

function parseWeekday(formData: FormData) {
  const direct = formString(formData, 'weekday')
  if (direct) {
    const parsed = parsePositiveInteger(direct)
    return parsed !== null && parsed <= 7 ? parsed : null
  }

  const zh = parsePositiveInteger(formString(formData, 'weekdayZh'))
  const en = parsePositiveInteger(formString(formData, 'weekdayEn'))
  const original = parsePositiveInteger(formString(formData, 'weekdayOriginal'))
  if (
    zh === null ||
    zh > 7 ||
    en === null ||
    en > 7 ||
    original === null ||
    original > 7
  ) {
    return null
  }
  if (zh === en) return zh
  if (zh === original) return en
  if (en === original) return zh
  return null
}

function availabilityWindowFrom(formData: FormData): AvailabilityWindowInput | null {
  const weekday = parseWeekday(formData)
  const startMinute = parseMinute(formString(formData, 'start'))
  const endMinute = parseMinute(formString(formData, 'end'), true)
  if (
    weekday === null ||
    startMinute === null ||
    endMinute === null ||
    startMinute >= endMinute
  ) {
    return null
  }
  return { isoWeekday: weekday, startMinute, endMinute }
}

function overrideIntervalsFrom(formData: FormData) {
  const starts = formStrings(formData, 'overrideStart')
  const ends = formStrings(formData, 'overrideEnd')
  if (starts.length === 0 || starts.length !== ends.length) return null

  const intervals: { startMinute: number; endMinute: number }[] = []
  for (let index = 0; index < starts.length; index += 1) {
    const startMinute = parseMinute(starts[index])
    const endMinute = parseMinute(ends[index], true)
    if (
      startMinute === null ||
      endMinute === null ||
      startMinute >= endMinute
    ) {
      return null
    }
    intervals.push({ startMinute, endMinute })
  }
  const ordered = [...intervals].sort((left, right) =>
    left.startMinute - right.startMinute || left.endMinute - right.endMinute,
  )
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index]!.startMinute < ordered[index - 1]!.endMinute) return null
  }
  return intervals
}

function weekdayIntervalsFrom(formData: FormData) {
  const starts = formStrings(formData, 'start')
  const ends = formStrings(formData, 'end')
  if (starts.length === 0 || starts.length !== ends.length) return null

  const intervals: { startMinute: number; endMinute: number }[] = []
  for (let index = 0; index < starts.length; index += 1) {
    const startMinute = parseMinute(starts[index])
    const endMinute = parseMinute(ends[index], true)
    if (
      startMinute === null ||
      endMinute === null ||
      startMinute >= endMinute
    ) {
      return null
    }
    intervals.push({ startMinute, endMinute })
  }
  const ordered = [...intervals].sort((left, right) =>
    left.startMinute - right.startMinute || left.endMinute - right.endMinute,
  )
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index]!.startMinute < ordered[index - 1]!.endMinute) return null
  }
  return ordered
}

export function createAvailabilityMutationHandler(
  dependencies: HandlerDependencies<AvailabilityMutationService>,
) {
  const { service, baseUrl } = dependencies
  return async function POST(request: Request) {
    const access = await enforceAdminRequestPolicy(
      dependencies,
      request,
      'browser-mutation',
    )
    if (denied(access)) return access

    try {
      const formData = await request.formData()
      const intent = formString(formData, 'intent')
      const id = parsePositiveInteger(formString(formData, 'id'))

      if (intent === 'set-time-zone') {
        const timeZone = formString(formData, 'timeZone')
        if (!timeZone) {
          return redirect(
            baseUrl,
            '/admin/ama/settings?availability=invalid-time-zone',
          )
        }
        await service.setTimeZone(timeZone)
      } else if (intent === 'set-weekday') {
        const weekday = parseWeekday(formData)
        const enabled = formString(formData, 'enabled')
        if (weekday === null || (enabled !== 'true' && enabled !== 'false')) {
          return redirect(baseUrl, '/admin/ama/settings?availability=invalid')
        }
        await service.setWeekday(weekday, enabled === 'true')
      } else if (intent === 'copy-weekday') {
        const weekday = parseWeekday(formData)
        const targets = formStrings(formData, 'targetWeekday')
          .map(parsePositiveInteger)
          .filter(
            (target): target is number => target !== null && target <= 7,
          )
        if (weekday === null || targets.length === 0) {
          return redirect(
            baseUrl,
            '/admin/ama/settings?availability=invalid-copy',
          )
        }
        await service.copyWeekday(weekday, targets)
      } else if (intent === 'save-weekday') {
        const weekday = parseWeekday(formData)
        const intervals = weekdayIntervalsFrom(formData)
        if (weekday === null || intervals === null) {
          return redirect(baseUrl, '/admin/ama/settings?availability=invalid')
        }
        await service.replaceWeekday(weekday, intervals)
      } else if (intent === 'save-override') {
        const localDate = formString(formData, 'localDate')
        const mode = formString(formData, 'overrideMode')
        const intervals =
          mode === 'closed'
            ? []
            : mode === 'custom'
              ? overrideIntervalsFrom(formData)
              : null
        if (!localDate || intervals === null) {
          return redirect(
            baseUrl,
            '/admin/ama/settings?availability=invalid-override',
          )
        }
        await service.saveOverride(localDate, intervals)
      } else if (intent === 'delete-override') {
        const localDate = formString(formData, 'localDate')
        if (!localDate) {
          return redirect(
            baseUrl,
            '/admin/ama/settings?availability=invalid-override',
          )
        }
        await service.deleteOverride(localDate)
      } else if (intent === 'delete' && id !== null) {
        await service.delete(id)
      } else {
        const input = availabilityWindowFrom(formData)
        if (!input || (intent === 'update' && id === null)) {
          return redirect(baseUrl, '/admin/ama/settings?availability=invalid')
        }
        if (intent === 'create') await service.create(input)
        else if (intent === 'update') await service.update(id!, input)
        else return redirect(baseUrl, '/admin/ama/settings?availability=invalid')
      }

      dependencies.security.recordPrivilegedAction(
        request,
        'availability_mutation.succeeded',
        access.actorId,
      )
      return redirect(baseUrl, '/admin/ama/settings?availability=saved')
    } catch {
      return redirect(baseUrl, '/admin/ama/settings?availability=failed')
    }
  }
}

export function createGoogleConnectHandler(
  dependencies: HandlerDependencies<AdminGoogleService>,
) {
  const { service, baseUrl } = dependencies
  return async function POST(request: Request) {
    const access = await enforceAdminRequestPolicy(
      dependencies,
      request,
      'browser-mutation',
      ['google'],
    )
    if (denied(access)) return access
    try {
      const providerUrl = await service.begin()
      dependencies.security.recordPrivilegedAction(
        request,
        'google_connect.started',
        access.actorId,
      )
      return redirect(baseUrl, providerUrl)
    } catch {
      return redirect(baseUrl, '/admin/ama/settings?calendar=unavailable')
    }
  }
}

export function createGoogleCallbackHandler(
  dependencies: HandlerDependencies<AdminGoogleService>,
) {
  const { service, baseUrl } = dependencies
  return async function GET(request: Request) {
    const access = await enforceAdminRequestPolicy(
      dependencies,
      request,
      'provider-callback',
      ['google'],
    )
    if (denied(access)) return access
    const params = new URL(request.url).searchParams
    try {
      const result = await service.complete({
        state: params.get('state'),
        code: params.get('code'),
        error: params.get('error'),
      })
      dependencies.security.recordPrivilegedAction(
        request,
        'google_callback.completed',
        access.actorId,
      )
      return redirect(baseUrl, `/admin/ama/settings?calendar=${result}`)
    } catch {
      return redirect(baseUrl, '/admin/ama/settings?calendar=unavailable')
    }
  }
}

export function createGoogleDisconnectHandler(
  dependencies: HandlerDependencies<AdminGoogleService>,
) {
  const { service, baseUrl } = dependencies
  return async function POST(request: Request) {
    const access = await enforceAdminRequestPolicy(
      dependencies,
      request,
      'browser-mutation',
      ['google'],
    )
    if (denied(access)) return access
    try {
      await service.disconnect()
      dependencies.security.recordPrivilegedAction(
        request,
        'google_disconnect.succeeded',
        access.actorId,
      )
      return redirect(baseUrl, '/admin/ama/settings?calendar=disconnected')
    } catch {
      return redirect(baseUrl, '/admin/ama/settings?calendar=unavailable')
    }
  }
}

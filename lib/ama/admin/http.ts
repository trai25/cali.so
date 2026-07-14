export interface OwnerRequestAuthenticator {
  authenticate(request: Request): Promise<boolean>
}

export type AvailabilityWindowInput = {
  isoWeekday: number
  startMinute: number
  endMinute: number
}

export interface AvailabilityMutationService {
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
  baseUrl: URL
}

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

async function requireOwner(
  authenticator: OwnerRequestAuthenticator,
  request: Request,
  baseUrl: URL,
) {
  if (await authenticator.authenticate(request)) return null
  return redirect(baseUrl, '/admin/login')
}

function formString(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
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

export function createAvailabilityMutationHandler({
  authenticator,
  service,
  baseUrl,
}: HandlerDependencies<AvailabilityMutationService>) {
  return async function POST(request: Request) {
    const unauthorized = await requireOwner(authenticator, request, baseUrl)
    if (unauthorized) return unauthorized

    try {
      const formData = await request.formData()
      const intent = formString(formData, 'intent')
      const id = parsePositiveInteger(formString(formData, 'id'))

      if (intent === 'delete' && id !== null) {
        await service.delete(id)
      } else {
        const input = availabilityWindowFrom(formData)
        if (!input || (intent === 'update' && id === null)) {
          return redirect(baseUrl, '/admin?availability=invalid')
        }
        if (intent === 'create') await service.create(input)
        else if (intent === 'update') await service.update(id!, input)
        else return redirect(baseUrl, '/admin?availability=invalid')
      }

      return redirect(baseUrl, '/admin?availability=saved')
    } catch {
      return redirect(baseUrl, '/admin?availability=failed')
    }
  }
}

export function createGoogleConnectHandler({
  authenticator,
  service,
  baseUrl,
}: HandlerDependencies<AdminGoogleService>) {
  return async function GET(request: Request) {
    const unauthorized = await requireOwner(authenticator, request, baseUrl)
    if (unauthorized) return unauthorized
    try {
      return redirect(baseUrl, await service.begin())
    } catch {
      return redirect(baseUrl, '/admin?calendar=unavailable')
    }
  }
}

export function createGoogleCallbackHandler({
  authenticator,
  service,
  baseUrl,
}: HandlerDependencies<AdminGoogleService>) {
  return async function GET(request: Request) {
    const unauthorized = await requireOwner(authenticator, request, baseUrl)
    if (unauthorized) return unauthorized
    const params = new URL(request.url).searchParams
    try {
      const result = await service.complete({
        state: params.get('state'),
        code: params.get('code'),
        error: params.get('error'),
      })
      return redirect(baseUrl, `/admin?calendar=${result}`)
    } catch {
      return redirect(baseUrl, '/admin?calendar=unavailable')
    }
  }
}

export function createGoogleDisconnectHandler({
  authenticator,
  service,
  baseUrl,
}: HandlerDependencies<AdminGoogleService>) {
  return async function POST(request: Request) {
    const unauthorized = await requireOwner(authenticator, request, baseUrl)
    if (unauthorized) return unauthorized
    try {
      await service.disconnect()
      return redirect(baseUrl, '/admin?calendar=disconnected')
    } catch {
      return redirect(baseUrl, '/admin?calendar=unavailable')
    }
  }
}

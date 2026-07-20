import { reloadLocation } from '~/lib/navigation'

export async function adminResponseJson(response: Response) {
  if (!response.ok && response.status === 401) {
    // A full navigation re-enters the protected admin page boundary, which
    // redirects an expired Clerk session back through sign-in. Do this before
    // parsing because an upstream authentication boundary may return an empty
    // or non-JSON response.
    reloadLocation()
  }
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'request_failed')
  }
  return body
}

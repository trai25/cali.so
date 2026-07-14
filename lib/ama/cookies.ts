export function readRequestCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie')
  if (!cookie) return undefined

  for (const item of cookie.split(';')) {
    const separator = item.indexOf('=')
    if (separator === -1) continue
    if (item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim()
    }
  }

  return undefined
}

type UploadChunkRetryDependencies = {
  fetcher?: typeof fetch
  now?: () => number
  wait?: (milliseconds: number) => Promise<void>
}

const MAX_UPLOAD_ATTEMPTS = 3

function retryAfterMilliseconds(response: Response, now: () => number) {
  const value = response.headers.get('retry-after')?.trim()
  if (!value) return null

  if (/^\d+$/.test(value)) return Number(value) * 1_000

  const retryAt = Date.parse(value)
  if (Number.isNaN(retryAt)) return null
  return Math.max(0, retryAt - now())
}

function isRetryableStatus(status: number) {
  return status === 429 || (status >= 500 && status < 600)
}

export async function uploadChunkWithRetry(
  url: string,
  init: RequestInit,
  {
    fetcher = fetch,
    now = Date.now,
    wait = (milliseconds) =>
      new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)),
  }: UploadChunkRetryDependencies = {},
) {
  let lastResponse: Response | null = null
  for (let attempt = 0; attempt < MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetcher(url, init)
      if (!isRetryableStatus(response.status)) return response
      lastResponse = response

      if (attempt < MAX_UPLOAD_ATTEMPTS - 1) {
        await wait(
          retryAfterMilliseconds(response, now) ?? 150 * (attempt + 1),
        )
      }
    } catch {
      if (attempt === MAX_UPLOAD_ATTEMPTS - 1) {
        throw new Error('upload_failed')
      }
      await wait(150 * (attempt + 1))
    }
  }
  return lastResponse ?? new Response(null, { status: 503 })
}

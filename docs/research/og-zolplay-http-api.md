# og.zolplay.com HTTP API

_Internal first-party contract supplied by Cali and live-verified on 2026-07-14._

`og.zolplay.com` is an HTTP service for fetching metadata and media derived
from a target webpage. The target URL is passed as a URL-encoded path segment.
The service automatically adds `https` when the target omits a scheme and
rejects private addresses and internal hosts.

## Endpoints

### `GET /metadata/:url`

Returns the target page's Open Graph metadata as JSON. Use it for link cards
and share-preview copy.

```text
https://og.zolplay.com/metadata/https%3A%2F%2Fexample.com
```

The response contains only fields discovered on the target page. A verified
response for `https://zolplay.com` included this shape:

```json
{
  "ogTitle": "Zolplay (Design Studio)",
  "ogDescription": "A design studio for people with good taste.",
  "ogImage": [
    {
      "type": "image/png",
      "url": "https://zolplay.com/en/opengraph-image?5b03c67451286787"
    }
  ],
  "ogType": "website",
  "ogSiteName": "Zolplay (Design Studio)",
  "ogLocale": "en"
}
```

### `GET /image/:url`

Returns the target page's Open Graph image.

- Default: proxies the image bytes through `og.zolplay.com`.
- `?redirect`: returns a `302` redirect to the source image.

```text
https://og.zolplay.com/image/https%3A%2F%2Fexample.com
https://og.zolplay.com/image/https%3A%2F%2Fexample.com?redirect
```

### `GET /favicon/:url`

Returns the target site's favicon.

- Default: proxies the image bytes through `og.zolplay.com`.
- `?redirect`: returns a `302` redirect to the source favicon.

```text
https://og.zolplay.com/favicon/https%3A%2F%2Fexample.com
https://og.zolplay.com/favicon/https%3A%2F%2Fexample.com?redirect
```

### `GET /screenshot/:url`

Returns a PNG screenshot of the target page. Supported query parameters:

- `width`
- `height`
- `scale`
- `fullPage=true`

```text
https://og.zolplay.com/screenshot/https%3A%2F%2Fexample.com?width=1440&height=900
```

## Client example

```ts
const target = encodeURIComponent('https://example.com')
const response = await fetch(`https://og.zolplay.com/metadata/${target}`)
const metadata = await response.json()
```

## Integration guidance

- Use `/metadata` for cached link-card data.
- Use `/image` when a link card needs the page's Open Graph image.
- Use `/favicon` instead of browser requests to Google S2 or target-specific
  favicon URLs.
- Use `/screenshot` when an Open Graph image is unavailable or a literal page
  thumbnail is required.
- Prefer proxy mode when consistent caching and response behavior matter.
- Prefer redirect mode when the final source URL is the desired output.
- Treat missing images and favicons as normal failures. Live verification
  returned `404` for an Example Domain Open Graph image and `500` for its
  missing favicon, while metadata and screenshots succeeded.

## Live verification

The following behavior was observed against `https://og.zolplay.com` on
2026-07-14:

| Request | Result |
| --- | --- |
| Metadata for `example.com` | `200` JSON with `ogTitle` and `ogLocale` |
| Screenshot for `example.com` | `200 image/png` |
| Image proxy for `zolplay.com` | `200 image/png` |
| Image redirect for `zolplay.com` | `302` to the source Open Graph image |
| Favicon proxy for `zolplay.com` | `200 image/x-icon` |
| Favicon redirect for `zolplay.com` | `302` to the source favicon |

Authentication, caching guarantees, rate limits, response-size limits, and
formal error schemas are not yet documented. Verify those before making the
service a runtime-critical dependency.

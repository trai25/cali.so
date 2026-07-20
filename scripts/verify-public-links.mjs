import assert from 'node:assert/strict'
import { isIP } from 'node:net'

import { JSDOM } from 'jsdom'

import { openProductionServer } from './production-server.mjs'

const productionOrigin =
  process.env.PUBLIC_LINKS_EXPECTED_ORIGIN ?? 'https://cali.so'
const externalTimeoutMs = 12_000
const externalConcurrency = 8
const verifyExternal = process.env.VERIFY_EXTERNAL_LINKS === '1'

function pathnameWithSearch(url) {
  return `${url.pathname}${url.search}`
}

async function fetchDocument(baseUrl, pathname, cache) {
  if (cache.has(pathname)) return cache.get(pathname)

  const promise = (async () => {
    const response = await fetch(new URL(pathname, baseUrl))
    assert.ok(response.status < 400, `${pathname} returned ${response.status}`)
    const type = response.headers.get('content-type') ?? ''
    assert.match(type, /text\/html/, `${pathname} is not HTML`)
    return new JSDOM(await response.text()).window.document
  })()
  cache.set(pathname, promise)
  return promise
}

async function sitemapPaths(baseUrl) {
  const response = await fetch(new URL('/sitemap.xml', baseUrl))
  assert.equal(response.status, 200)
  const document = new JSDOM(await response.text(), {
    contentType: 'text/xml',
  }).window.document
  assert.equal(document.querySelector('parsererror'), null)

  return [...document.querySelectorAll('url > loc')].map((element) => {
    const url = new URL(element.textContent ?? '')
    assert.equal(url.origin, productionOrigin)
    return pathnameWithSearch(url)
  })
}

function collectLinks(document, pagePath, internal, external) {
  const pageUrl = new URL(pagePath, productionOrigin)

  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href')
    assert.ok(href)

    if (/^(?:mailto|tel):/i.test(href)) {
      const url = new URL(href)
      assert.ok(url.pathname.trim(), `${pagePath} has an empty ${url.protocol} link`)
      continue
    }
    if (/^(?:javascript|data):/i.test(href)) {
      assert.fail(`${pagePath} has a forbidden link protocol: ${href}`)
    }

    const url = new URL(href, pageUrl)
    if (url.origin === productionOrigin) {
      internal.add(JSON.stringify({
        fragment: url.hash.slice(1),
        source: pagePath,
        target: pathnameWithSearch(url),
      }))
    } else {
      assert.equal(url.protocol, 'https:', `${pagePath} links to insecure ${url.href}`)
      assert.equal(isIP(url.hostname), 0, `${pagePath} links directly to an IP address`)
      assert.ok(
        url.hostname !== 'localhost' && !url.hostname.endsWith('.localhost'),
        `${pagePath} links to a local hostname`,
      )
      external.add(url.href)
    }
  }
}

async function verifyInternalLink(baseUrl, serialized, cache) {
  const { fragment, source, target } = JSON.parse(serialized)
  if (!fragment) {
    const response = await fetch(new URL(target, baseUrl))
    assert.ok(response.status < 400, `${source} links to ${target}, which returned ${response.status}`)
    await response.body?.cancel()
    return
  }

  const document = await fetchDocument(baseUrl, target, cache)
  const decoded = decodeURIComponent(fragment)
  const targetElement = document.getElementById(decoded)
  assert.ok(targetElement, `${source} links to missing ${target}#${fragment}`)
}

async function verifyExternalLink(href) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(href, {
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.1',
          'user-agent': 'cali.so release link verifier',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(externalTimeoutMs),
      })
      await response.body?.cancel()
      if ([404, 410].includes(response.status)) {
        const error = new Error(`${href} returned ${response.status}`)
        error.definitive = true
        throw error
      }
      if (response.status < 500) return null
      lastError = new Error(`${href} returned ${response.status}`)
    } catch (error) {
      if (error?.definitive) {
        lastError = error
        break
      }
      lastError = new Error(
        `${href} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }
  if (lastError?.definitive) throw lastError
  return lastError?.message ?? `${href} could not be checked`
}

async function verifyInBatches(values, size, verify) {
  const failures = []
  const notes = []
  for (let index = 0; index < values.length; index += size) {
    const results = await Promise.allSettled(values.slice(index, index + size).map(verify))
    for (const result of results) {
      if (result.status === 'rejected') failures.push(result.reason)
      else if (result.value) notes.push(result.value)
    }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} public links failed`)
  return notes
}

const server = await openProductionServer(process.env.PUBLIC_LINKS_BASE_URL)
try {
  const paths = await sitemapPaths(server.baseUrl)
  const documentCache = new Map()
  const internal = new Set()
  const external = new Set()

  for (const path of paths) {
    const document = await fetchDocument(server.baseUrl, path, documentCache)
    collectLinks(document, path, internal, external)
  }

  await verifyInBatches([...internal], 16, (link) =>
    verifyInternalLink(server.baseUrl, link, documentCache),
  )
  let inconclusive = []
  if (verifyExternal) {
    inconclusive = await verifyInBatches([...external], externalConcurrency, verifyExternalLink)
    for (const note of inconclusive) console.warn(`External link check inconclusive: ${note}`)
  }

  console.log(
    `Verified ${internal.size} internal links and ${
      verifyExternal ? 'live-checked' : 'validated'
    } ${external.size} external links across ${paths.length} sitemap pages${
      inconclusive.length ? ` (${inconclusive.length} transiently inconclusive)` : ''
    }`,
  )
} finally {
  await server.stop()
}

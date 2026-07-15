import assert from 'node:assert/strict'

import { JSDOM } from 'jsdom'

import { openProductionServer } from './production-server.mjs'

const productionOrigin = 'https://cali.so'
const representativePages = [
  { path: '/', locale: 'zh-CN', canonical: '/' },
  { path: '/en', locale: 'en', canonical: '/en' },
  { path: '/blog/how-to-add-rss-to-your-nextjs-app-router', locale: 'zh-CN' },
  { path: '/en/blog/how-to-add-rss-to-your-nextjs-app-router', locale: 'en' },
  { path: '/newsletters/1', locale: 'zh-CN' },
  { path: '/en/newsletters/1', locale: 'en' },
]

function expectedCanonical(page) {
  return new URL(page.canonical ?? page.path, productionOrigin).href
}

function requiredElement(document, selector, description) {
  const element = document.querySelector(selector)
  assert.ok(element, `missing ${description}`)
  return element
}

async function verifyMetadata(baseUrl, page) {
  const response = await fetch(new URL(page.path, baseUrl))
  assert.equal(response.status, 200, `${page.path} status`)
  const dom = new JSDOM(await response.text())
  const { document } = dom.window

  assert.equal(document.documentElement.lang, page.locale, `${page.path} lang`)
  const canonical = requiredElement(
    document,
    'link[rel="canonical"]',
    `${page.path} canonical`,
  ).getAttribute('href')
  assert.ok(canonical)
  assert.equal(
    new URL(canonical).href,
    expectedCanonical(page),
    `${page.path} canonical`,
  )

  const unlocalized = page.path.replace(/^\/en(?=\/|$)/, '') || '/'
  const zh = new URL(unlocalized, productionOrigin).href
  const enPath = unlocalized === '/' ? '/en' : `/en${unlocalized}`
  const en = new URL(enPath, productionOrigin).href
  for (const [language, expected] of [
    ['zh-CN', zh],
    ['en', en],
    ['x-default', zh],
  ]) {
    const alternate = requiredElement(
      document,
      `link[rel="alternate"][hreflang="${language}"]`,
      `${page.path} ${language} alternate`,
    ).getAttribute('href')
    assert.ok(alternate)
    assert.equal(new URL(alternate).href, expected)
  }

  assert.equal(
    requiredElement(
      document,
      'meta[property="og:locale"]',
      `${page.path} OG locale`,
    ).getAttribute('content'),
    page.locale === 'en' ? 'en_US' : 'zh_CN',
  )
  const ogImage = requiredElement(
    document,
    'meta[property="og:image"]',
    `${page.path} OG image`,
  ).getAttribute('content')
  assert.ok(ogImage)
  assert.equal(new URL(ogImage).origin, productionOrigin)
  const localImage = new URL(new URL(ogImage).pathname, baseUrl)
  const imageResponse = await fetch(localImage)
  assert.equal(imageResponse.status, 200, `${page.path} OG image status`)
  assert.match(imageResponse.headers.get('content-type') ?? '', /^image\/png/)
}

async function verifyDiscoveryFiles(baseUrl) {
  const sitemap = await fetch(new URL('/sitemap.xml', baseUrl))
  assert.equal(sitemap.status, 200)
  assert.match(
    sitemap.headers.get('content-type') ?? '',
    /(?:application|text)\/xml/,
  )
  const sitemapXml = await sitemap.text()
  for (const path of [
    '/',
    '/en',
    '/blog',
    '/en/blog',
    '/photos',
    '/en/photos',
    '/projects',
    '/en/projects',
    '/newsletters/1',
    '/en/newsletters/1',
  ]) {
    assert.ok(
      sitemapXml.includes(new URL(path, productionOrigin).href),
      `sitemap ${path}`,
    )
  }

  const robots = await fetch(new URL('/robots.txt', baseUrl))
  assert.equal(robots.status, 200)
  const robotsText = await robots.text()
  assert.match(robotsText, /User-Agent: \*/)
  assert.match(robotsText, /Allow: \//)
  assert.match(robotsText, /Disallow: \/admin/)
  assert.match(robotsText, /Disallow: \/api\/admin/)
  assert.match(robotsText, /Sitemap: https:\/\/cali\.so\/sitemap\.xml/)

  const icon = await fetch(new URL('/icon.png', baseUrl))
  assert.equal(icon.status, 200)
  assert.match(icon.headers.get('content-type') ?? '', /^image\/png/)
  const iconBytes = new Uint8Array(await icon.arrayBuffer())
  assert.deepEqual([...iconBytes.slice(1, 4)], [0x50, 0x4e, 0x47])
}

async function verifyNotFound(baseUrl) {
  const response = await fetch(new URL('/release-check-missing', baseUrl))
  assert.equal(response.status, 404)
  const body = await response.text()
  const document = new JSDOM(body).window.document
  for (const element of document.querySelectorAll(
    'script, style, template, noscript',
  )) {
    element.remove()
  }
  const visibleText = document.body?.textContent ?? ''
  assert.match(visibleText, /This page slipped off the grid/)
  assert.match(visibleText, /Go home/)
  assert.doesNotMatch(
    visibleText,
    /(?:node_modules|\/Users\/|Error:|at\s+\w+\s*\()/,
  )
}

const server = await openProductionServer(process.env.PUBLIC_DISCOVERY_BASE_URL)
try {
  await verifyDiscoveryFiles(server.baseUrl)
  for (const page of representativePages) {
    await verifyMetadata(server.baseUrl, page)
  }
  await verifyNotFound(server.baseUrl)
  console.log(
    `Verified public discovery and failure handling against ${server.baseUrl}`,
  )
} finally {
  await server.stop()
}

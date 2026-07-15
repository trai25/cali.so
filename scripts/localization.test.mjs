import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import matter from 'gray-matter'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const blogRoot = join(repositoryRoot, 'content', 'blog')
const newsletterRoot = join(repositoryRoot, 'content', 'newsletters')
const linkPreviewsPath = join(repositoryRoot, 'content', 'link-previews.json')
const hanPattern = /\p{Script=Han}/u
const dashPattern = /[—–]/u

function withoutFencedCode(source) {
  return source.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, '')
}

function localImageReferences(source) {
  return [
    ...withoutFencedCode(source).matchAll(
      /!\[[^\]]*\]\(((?:\.\/|\/content\/)[^\s)]+)(?:\s+"[^"]*")?\)/g,
    ),
  ].map(([, reference]) => reference)
}

function mdxComponentInvocations(source) {
  const componentPattern =
    /<[A-Z][A-Za-z0-9.]*\b(?:[^"'<>]|"[^"]*"|'[^']*')*\/?>/gs

  return [...withoutFencedCode(source).matchAll(componentPattern)].map(
    ([invocation]) => invocation,
  )
}

function assertOccurrencesPreserved(original, english, description) {
  const available = new Map()
  for (const value of english) {
    available.set(value, (available.get(value) ?? 0) + 1)
  }

  for (const value of original) {
    const remaining = available.get(value) ?? 0
    assert.ok(remaining > 0, `${description} ${value}`)
    available.set(value, remaining - 1)
  }
}

async function contentDirectories(root) {
  const entries = await readdir(root, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

test('every blog post has a complete English source', async (t) => {
  for (const directory of await contentDirectories(blogRoot)) {
    const originalPath = join(blogRoot, directory, 'index.mdx')

    let originalSource
    try {
      originalSource = await readFile(originalPath, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }

    await t.test(directory, async () => {
      const englishPath = join(blogRoot, directory, 'index.en.mdx')
      let englishSource

      try {
        englishSource = await readFile(englishPath, 'utf8')
      } catch (error) {
        assert.notEqual(
          error?.code,
          'ENOENT',
          `${directory} has index.mdx but is missing index.en.mdx`,
        )
        throw error
      }

      const original = matter(originalSource)
      const english = matter(englishSource)

      assert.doesNotMatch(
        originalSource,
        dashPattern,
        `${directory}/index.mdx must not contain em or en dashes`,
      )
      assert.doesNotMatch(
        englishSource,
        dashPattern,
        `${directory}/index.en.mdx must not contain em or en dashes`,
      )

      assert.equal(
        typeof english.data.title,
        'string',
        `${directory} must have an English title`,
      )
      assert.ok(english.data.title.trim(), `${directory} must have a nonempty English title`)
      assert.equal(
        typeof english.data.description,
        'string',
        `${directory} must have an English description`,
      )
      assert.ok(
        english.data.description.trim(),
        `${directory} must have a nonempty English description`,
      )
      assert.doesNotMatch(
        englishSource,
        hanPattern,
        `${directory}/index.en.mdx must not contain Han characters`,
      )

      assertOccurrencesPreserved(
        localImageReferences(original.content),
        localImageReferences(english.content),
        `${directory}/index.en.mdx is missing image reference`,
      )
      assertOccurrencesPreserved(
        mdxComponentInvocations(original.content),
        mdxComponentInvocations(english.content),
        `${directory}/index.en.mdx is missing MDX component invocation`,
      )
    })
  }
})

test('every newsletter archive has a complete English source', async (t) => {
  for (const directory of await contentDirectories(newsletterRoot)) {
    const originalPath = join(newsletterRoot, directory, 'index.mdx')
    const originalSource = await readFile(originalPath, 'utf8')

    await t.test(directory, async () => {
      const englishPath = join(newsletterRoot, directory, 'index.en.mdx')
      let englishSource

      try {
        englishSource = await readFile(englishPath, 'utf8')
      } catch (error) {
        assert.notEqual(
          error?.code,
          'ENOENT',
          `${directory} has index.mdx but is missing index.en.mdx`,
        )
        throw error
      }

      const english = matter(englishSource)

      assert.doesNotMatch(
        originalSource,
        dashPattern,
        `${directory}/index.mdx must not contain em or en dashes`,
      )
      assert.doesNotMatch(
        englishSource,
        dashPattern,
        `${directory}/index.en.mdx must not contain em or en dashes`,
      )
      assert.equal(
        typeof english.data.title,
        'string',
        `${directory} must have an English title`,
      )
      assert.ok(
        english.data.title.trim(),
        `${directory} must have a nonempty English title`,
      )
      assert.equal(
        typeof english.data.description,
        'string',
        `${directory} must have an English description`,
      )
      assert.ok(
        english.data.description.trim(),
        `${directory} must have a nonempty English description`,
      )
      assert.doesNotMatch(
        englishSource,
        hanPattern,
        `${directory}/index.en.mdx must not contain Han characters`,
      )
      assertOccurrencesPreserved(
        localImageReferences(originalSource),
        localImageReferences(englishSource),
        `${directory}/index.en.mdx is missing image reference`,
      )
    })
  }
})

test('Han link-preview fields have English equivalents', async (t) => {
  const previews = JSON.parse(await readFile(linkPreviewsPath, 'utf8'))

  for (const [url, preview] of Object.entries(previews)) {
    await t.test(url, () => {
      for (const field of ['title', 'titleEn', 'description', 'descriptionEn']) {
        const value = preview[field]
        if (typeof value !== 'string') continue

        assert.doesNotMatch(
          value,
          dashPattern,
          `${url} ${field} must not contain em or en dashes`,
        )
      }

      for (const field of ['title', 'description']) {
        const value = preview[field]
        if (typeof value !== 'string' || !hanPattern.test(value)) continue

        const englishField = `${field}En`
        const englishValue = preview[englishField]
        assert.equal(
          typeof englishValue,
          'string',
          `${url} needs ${englishField} because ${field} contains Han characters`,
        )
        assert.ok(englishValue.trim(), `${url} must have a nonempty ${englishField}`)
        assert.doesNotMatch(
          englishValue,
          hanPattern,
          `${url} ${englishField} must not contain Han characters`,
        )
      }
    })
  }
})

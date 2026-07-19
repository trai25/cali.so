import assert from 'node:assert/strict'
import test from 'node:test'

import { renderPortableTextBody, renderTextBlockGroup } from './port-post-render.mjs'

const span = (text, marks = []) => ({ _type: 'span', text, marks })

test('renders contiguous Portable Text list blocks as one nested Markdown list', () => {
  const blocks = [
    { _type: 'block', style: 'normal', listItem: 'bullet', level: 1, children: [span('First')] },
    {
      _type: 'block',
      style: 'normal',
      listItem: 'bullet',
      level: 2,
      children: [span('Nested '), span('bold', ['strong'])],
    },
    { _type: 'block', style: 'normal', listItem: 'bullet', level: 1, children: [span('Last')] },
  ]

  assert.equal(renderTextBlockGroup(blocks), '- First\n    - Nested **bold**\n- Last')
})

test('preserves ordered and unordered list semantics across contiguous blocks', () => {
  const blocks = [
    { _type: 'block', style: 'normal', listItem: 'number', level: 1, children: [span('One')] },
    {
      _type: 'block',
      style: 'normal',
      listItem: 'number',
      level: 2,
      children: [span('One point one')],
    },
    {
      _type: 'block',
      style: 'normal',
      listItem: 'bullet',
      level: 2,
      children: [span('A nested bullet')],
    },
    { _type: 'block', style: 'normal', listItem: 'number', level: 1, children: [span('Two')] },
  ]

  assert.equal(
    renderTextBlockGroup(blocks),
    '1. One\n    1. One point one\n\n    - A nested bullet\n1. Two',
  )
})

test('keeps non-list block rendering unchanged', () => {
  const link = { _key: 'link', _type: 'link', href: 'https://example.com' }
  const blocks = [
    { _type: 'block', style: 'h2', children: [span('Heading')] },
    {
      _type: 'block',
      style: 'normal',
      markDefs: [link],
      children: [span('A '), span('link', ['link']), span(' and '), span('code', ['code'])],
    },
  ]

  assert.deepEqual(blocks.map(renderTextBlockGroup), [
    '## Heading',
    'A [link](https://example.com) and `code`',
  ])
})

test('escapes MDX backslashes and chooses safe inline-code delimiters', () => {
  const blocks = [
    {
      _type: 'block',
      style: 'normal',
      children: [span('C:\\draft {notes}'), span(' '), span('`literal`', ['code'])],
    },
  ]

  assert.equal(
    renderTextBlockGroup(blocks),
    'C:\\\\draft \\{notes\\} `` `literal` ``',
  )
})

test('treats code as a literal mark regardless of mark order', () => {
  const block = {
    _type: 'block',
    style: 'normal',
    children: [
      span('literal', ['strong', 'code']),
      span(' '),
      span('literal', ['code', 'strong']),
    ],
  }

  assert.equal(renderTextBlockGroup(block), '`literal` `literal`')
})

test('converts a complete Portable Text body without flattening list groups', async () => {
  const body = [
    { _type: 'block', style: 'normal', children: [span('Before')] },
    { _type: 'block', style: 'normal', listItem: 'bullet', level: 1, children: [span('First')] },
    { _type: 'block', style: 'normal', listItem: 'bullet', level: 1, children: [span('Second')] },
    { _type: 'codeBlock', language: 'js', filename: 'demo.js', code: 'const ok = true' },
    {
      _type: 'image',
      asset: { _ref: 'image-test-10x20-png' },
      alt: 'An <image>',
      label: 'A {label}',
    },
    { _type: 'tweet', id: '123' },
    { _type: 'block', style: 'normal', listItem: 'number', level: 1, children: [span('One')] },
    { _type: 'block', style: 'normal', children: [span('After')] },
  ]
  const localized = []

  const result = await renderPortableTextBody(body, {
    localizeImage: async (ref, name) => {
      localized.push({ ref, name })
      return { local: `${name}.png`, width: 10, height: 20 }
    },
  })

  assert.deepEqual(result, [
    'Before',
    '- First\n- Second',
    '```js title="demo.js"\nconst ok = true\n```',
    '![An \\<image\\>](./image-1.png#10x20 "A \\{label\\}")',
    '<Tweet id="123" />',
    '1. One',
    'After',
  ])
  assert.deepEqual(localized, [{ ref: 'image-test-10x20-png', name: 'image-1' }])
})

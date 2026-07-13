export function escapeText(text) {
  return text.replace(/([{}<>])/g, '\\$1')
}

function renderSpan(span, markDefs) {
  let text = escapeText(span.text)
  for (const mark of span.marks ?? []) {
    if (mark === 'strong') text = `**${text}**`
    else if (mark === 'em') text = `*${text}*`
    else if (mark === 'code') text = `\`${span.text.replace(/`/g, '\\`')}\``
    else {
      const def = markDefs?.find((candidate) => candidate._key === mark)
      if (def?._type === 'link') text = `[${text}](${def.href})`
      else console.warn(`  ! unknown mark ${mark}`)
    }
  }
  return text
}

function renderBlockText(block) {
  return (block.children ?? []).map((span) => renderSpan(span, block.markDefs)).join('')
}

function renderNonListBlock(block) {
  const text = renderBlockText(block)
  if (!text.trim()) return ''

  const prefix = { h2: '## ', h3: '### ', h4: '#### ', blockquote: '> ', normal: '' }[
    block.style ?? 'normal'
  ]
  if (prefix === undefined) console.warn(`  ! unknown style ${block.style}`)
  return (prefix ?? '') + text
}

function renderListBlocks(blocks) {
  const lines = []
  const listTypeAtLevel = new Map()

  for (const block of blocks) {
    const text = renderBlockText(block)
    if (!text.trim()) continue

    const level = Number.isInteger(block.level) && block.level > 0 ? block.level : 1
    const previousType = listTypeAtLevel.get(level)
    if (previousType && previousType !== block.listItem) lines.push('')

    for (const activeLevel of listTypeAtLevel.keys()) {
      if (activeLevel > level) listTypeAtLevel.delete(activeLevel)
    }
    listTypeAtLevel.set(level, block.listItem)

    const marker = block.listItem === 'number' ? '1.' : '-'
    lines.push(`${'    '.repeat(level - 1)}${marker} ${text}`)
  }

  return lines.join('\n')
}

export function renderTextBlockGroup(blockOrBlocks) {
  const blocks = Array.isArray(blockOrBlocks) ? blockOrBlocks : [blockOrBlocks]
  if (blocks[0]?.listItem) return renderListBlocks(blocks)
  return blocks.map(renderNonListBlock).filter(Boolean).join('\n\n')
}

export async function renderPortableTextBody(body, { localizeImage } = {}) {
  const mdx = []
  let imgIndex = 0

  for (let blockIndex = 0; blockIndex < body.length; blockIndex += 1) {
    const block = body[blockIndex]

    if (block._type === 'block') {
      if (block.listItem) {
        const listBlocks = [block]
        while (body[blockIndex + 1]?._type === 'block' && body[blockIndex + 1].listItem) {
          listBlocks.push(body[blockIndex + 1])
          blockIndex += 1
        }
        const list = renderTextBlockGroup(listBlocks)
        if (list) mdx.push(list)
      } else {
        const text = renderTextBlockGroup(block)
        if (text) mdx.push(text)
      }
    } else if (block._type === 'codeBlock') {
      const meta = block.filename ? ` title="${block.filename}"` : ''
      mdx.push(`\`\`\`${block.language ?? 'text'}${meta}\n${block.code}\n\`\`\``)
    } else if (block._type === 'image') {
      if (!localizeImage) throw new Error('image block requires localizeImage')
      imgIndex += 1
      const { local, width, height } = await localizeImage(block.asset._ref, `image-${imgIndex}`)
      const alt = escapeText(block.alt ?? '')
      const label = block.label ? ` "${escapeText(block.label)}"` : ''
      mdx.push(`![${alt}](./${local}#${width}x${height}${label})`)
    } else if (block._type === 'tweet') {
      mdx.push(`<Tweet id="${block.id}" />`)
    } else {
      console.warn(`  ! unhandled block type ${block._type}`)
    }
  }

  return mdx
}

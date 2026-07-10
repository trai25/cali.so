// Convert one archived Sanity post (Portable Text) to MDX with colocated
// images: node port-post.mjs <slug> <archive-dir> <repo-content-dir>
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const [slug, ARCHIVE, CONTENT] = process.argv.slice(2)
const posts = require(join(ARCHIVE, 'sanity-export/documents/post.json'))
const post = posts.find((p) => p.slug.current === slug)
if (!post) throw new Error(`no post with slug ${slug}`)

const outDir = join(CONTENT, slug)
await mkdir(outDir, { recursive: true })

// image-<hash>-<WxH>-<ext> asset ref -> archived filename + dimensions
function assetFile(ref) {
  const m = ref.match(/^image-([a-f0-9]+)-(\d+)x(\d+)-(\w+)$/)
  if (!m) throw new Error(`unparseable asset ref: ${ref}`)
  return { file: `${m[1]}-${m[2]}x${m[3]}.${m[4]}`, width: +m[2], height: +m[3] }
}

const copied = []
async function localizeImage(ref, name) {
  const { file, width, height } = assetFile(ref)
  const ext = file.split('.').pop()
  const local = `${name}.${ext}`
  await copyFile(join(ARCHIVE, 'sanity-export/images', file), join(outDir, local))
  copied.push(local)
  return { local, width, height }
}

function escapeText(t) {
  return t.replace(/([{}<>])/g, '\\$1')
}

function renderSpan(span, markDefs) {
  let text = escapeText(span.text)
  for (const mark of span.marks ?? []) {
    if (mark === 'strong') text = `**${text}**`
    else if (mark === 'em') text = `*${text}*`
    else if (mark === 'code') text = `\`${span.text.replace(/`/g, '\\`')}\``
    else {
      const def = markDefs?.find((d) => d._key === mark)
      if (def?._type === 'link') text = `[${text}](${def.href})`
      else console.warn(`  ! unknown mark ${mark}`)
    }
  }
  return text
}

let mdx = []
let imgIndex = 0
for (const block of post.body) {
  if (block._type === 'block') {
    const text = (block.children ?? []).map((s) => renderSpan(s, block.markDefs)).join('')
    if (!text.trim()) continue
    const prefix = { h2: '## ', h3: '### ', h4: '#### ', blockquote: '> ', normal: '' }[block.style ?? 'normal']
    if (prefix === undefined) console.warn(`  ! unknown style ${block.style}`)
    mdx.push((prefix ?? '') + text)
  } else if (block._type === 'codeBlock') {
    const meta = block.filename ? ` title="${block.filename}"` : ''
    mdx.push(`\`\`\`${block.language ?? 'text'}${meta}\n${block.code}\n\`\`\``)
  } else if (block._type === 'image') {
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

let cover = null
if (post.mainImage?.asset?._ref) {
  cover = await localizeImage(post.mainImage.asset._ref, 'cover')
}

const fm = [
  '---',
  `title: ${JSON.stringify(post.title)}`,
  post.description ? `description: ${JSON.stringify(post.description)}` : null,
  `publishedAt: ${JSON.stringify(post.publishedAt)}`,
  cover ? `cover: ./${cover.local}` : null,
  cover ? `coverWidth: ${cover.width}` : null,
  cover ? `coverHeight: ${cover.height}` : null,
  '---',
].filter(Boolean)

await writeFile(join(outDir, 'index.mdx'), fm.join('\n') + '\n\n' + mdx.join('\n\n') + '\n')
console.log(`${slug}: ${post.body.length} blocks -> index.mdx, images: ${copied.join(', ')}`)

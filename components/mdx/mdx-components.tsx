import Image from 'next/image'
import type { MDXComponents } from 'mdx/types'

import { CodeBlockPre } from './code-block'

// Post images arrive as ./file.png#WxH (dimensions encoded by the content
// pipeline); rewrite to the content route and unpack the dimensions.
function PostImage({ slug, src, alt, title }: { slug: string; src: string; alt?: string; title?: string }) {
  const match = src.match(/^\.\/([A-Za-z0-9_.-]+)#(\d+)x(\d+)$/)
  if (!match) throw new Error(`post image needs ./file#WxH format, got: ${src}`)
  const [, file, width, height] = match
  const img = (
    <Image
      src={`/content/blog/${slug}/${file}`}
      alt={alt ?? ''}
      width={+width}
      height={+height}
      className="rounded-lg"
      sizes="(max-width: 704px) 100vw, 656px"
    />
  )
  if (!title) return img
  // Markdown images render inside <p>, where <figure> is invalid HTML —
  // block-level spans carry the same styling.
  return (
    <span className="post-figure block">
      {img}
      <span className="post-figcaption block">{title}</span>
    </span>
  )
}

export function mdxComponents(slug: string): MDXComponents {
  return {
    pre: (props) => <CodeBlockPre {...props} />,
    img: (props) => (
      <PostImage slug={slug} src={props.src as string} alt={props.alt} title={props.title} />
    ),
    a: (props) => {
      const external = typeof props.href === 'string' && /^https?:/.test(props.href)
      return (
        <a {...props} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {props.children}
        </a>
      )
    },
  }
}

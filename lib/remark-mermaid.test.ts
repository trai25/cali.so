import { describe, expect, it } from 'vitest'

import remarkMermaid from './remark-mermaid'

interface Node {
  type: string
  lang?: string | null
  meta?: string | null
  value?: string
  children?: Node[]
  name?: string
  attributes?: { type: string; name: string; value: string }[]
}

function transform(tree: Node) {
  remarkMermaid()(tree)
  return tree
}

function code(lang: string | null, value: string, meta: string | null = null): Node {
  return { type: 'code', lang, meta, value }
}

describe('remark-mermaid', () => {
  it('rewrites a mermaid fence to the diagram component', () => {
    const tree = transform({
      type: 'root',
      children: [code('mermaid', 'flowchart LR\n  A --> B')],
    })

    expect(tree.children?.[0]).toMatchObject({
      type: 'mdxJsxFlowElement',
      name: 'MermaidDiagram',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'code', value: 'flowchart LR\n  A --> B' },
      ],
    })
  })

  it('carries a caption from the fence meta', () => {
    const tree = transform({
      type: 'root',
      children: [code('mermaid', 'flowchart LR\n  A --> B', 'caption="RSS 订阅流程"')],
    })

    expect(tree.children?.[0].attributes).toContainEqual({
      type: 'mdxJsxAttribute',
      name: 'caption',
      value: 'RSS 订阅流程',
    })
  })

  it('leaves other code fences for the syntax highlighter', () => {
    const tree = transform({
      type: 'root',
      children: [code('ts', 'const a = 1'), code(null, 'plain text')],
    })

    expect(tree.children?.map((child) => child.type)).toEqual(['code', 'code'])
  })

  it('rewrites fences nested inside other content', () => {
    const tree = transform({
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [code('mermaid', 'flowchart TD\n  A --> B')],
        },
      ],
    })

    expect(tree.children?.[0].children?.[0]).toMatchObject({
      name: 'MermaidDiagram',
    })
  })
})

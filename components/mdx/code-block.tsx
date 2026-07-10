'use client'

import { Check, Copy } from 'lucide-react'
import { useRef, useState } from 'react'

export function CodeBlockPre(props: React.HTMLAttributes<HTMLPreElement>) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  function copy() {
    const code = preRef.current?.querySelector('code')?.innerText
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="code-frame">
      <pre ref={preRef} {...props} />
      <button
        type="button"
        onClick={copy}
        aria-label="复制代码"
        className="code-copy"
        data-copied={copied || undefined}
      >
        {/* fixed slot: both icons same size, no layout shift on swap */}
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      </button>
    </div>
  )
}

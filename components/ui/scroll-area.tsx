'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '~/lib/utils'

// Fluid horizontal scroll area: edge fades appear only while content
// actually continues in that direction — the fade is information, not
// decoration. State updates on scroll and resize; the fade strips tint
// with the surface behind them via --scroll-fade-surface.
export function ScrollAreaX({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const update = () => {
      const start = viewport.scrollLeft > 1
      const end = viewport.scrollLeft < viewport.scrollWidth - viewport.clientWidth - 1
      setEdges((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end },
      )
    }

    update()
    viewport.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    for (const child of viewport.children) observer.observe(child)
    return () => {
      viewport.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  return (
    <div className={cn('scroll-area-x', className)}>
      <div ref={viewportRef} className="scroll-area-x-viewport">
        {children}
      </div>
      <span
        aria-hidden
        className="scroll-area-x-fade scroll-area-x-fade-start"
        data-visible={edges.start || undefined}
      />
      <span
        aria-hidden
        className="scroll-area-x-fade scroll-area-x-fade-end"
        data-visible={edges.end || undefined}
      />
    </div>
  )
}

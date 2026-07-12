'use client'

import { useEffect, useRef, useState } from 'react'

import type { Heading } from '~/lib/content'

const READING_LINE = 0.28 // fraction of viewport height

// Left-margin table of contents. The section being read carries a
// hand-drawn squiggle that draws itself in; a ghost of the post title
// appears above the list once the real one scrolls away. Scroll-spy is
// scroll-math (last heading above the reading line, with first/last
// overrides at the page extremes); clicking pins the choice while the
// smooth scroll travels. Absent below 64rem.
export function PostToc({ headings, title }: { headings: Heading[]; title: string }) {
  const [active, setActive] = useState(headings[0]?.id)
  const [ghost, setGhost] = useState(false)
  const activeRef = useRef(active)
  const pinnedRef = useRef(false)
  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    const targets = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null)
    if (targets.length === 0) return
    const h1 = document.querySelector('article h1')

    let ticking = false
    const measure = () => {
      ticking = false
      // ghost title: appears when the real one scrolls past (±12px hysteresis)
      if (h1) {
        const bottom = h1.getBoundingClientRect().bottom
        setGhost((g) => (g ? bottom < 12 : bottom < -12))
      }
      if (pinnedRef.current) return
      const line = window.innerHeight * READING_LINE
      let current = targets[0].id
      for (const el of targets) {
        if (el.getBoundingClientRect().top <= line) current = el.id
        else break
      }
      // page extremes override: top → first, bottom → last
      if (window.scrollY <= 1) current = targets[0].id
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2)
        current = targets[targets.length - 1].id
      if (current !== activeRef.current) setActive(current)
    }
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(measure)
      }
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [headings])

  // pin the clicked item until the smooth scroll settles (5 stable frames)
  function pinUntilSettled() {
    pinnedRef.current = true
    let last = -1
    let stable = 0
    const watch = () => {
      if (window.scrollY === last) stable++
      else stable = 0
      last = window.scrollY
      if (stable >= 5) pinnedRef.current = false
      else requestAnimationFrame(watch)
    }
    requestAnimationFrame(watch)
  }

  if (headings.length < 2) return null

  return (
    <nav className="post-toc" aria-label="目录 / Table of contents">
      <button
        type="button"
        className="post-toc-title"
        data-visible={ghost || undefined}
        tabIndex={ghost ? 0 : -1}
        onClick={() => {
          const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
        }}
      >
        {title}
      </button>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id} data-level={heading.level}>
            <a
              href={`#${heading.id}`}
              aria-current={active === heading.id ? 'true' : undefined}
              onClick={(event) => {
                event.preventDefault()
                const el = document.getElementById(heading.id)
                if (!el) return
                setActive(heading.id)
                pinUntilSettled()
                const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
                el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
                history.replaceState(null, '', `#${heading.id}`)
              }}
            >
              <svg className="post-toc-squiggle" viewBox="0 0 14 6" width="14" height="6" aria-hidden>
                <path d="M1 3.1C2.8 1.5 5 4.5 7 2.9C9 1.3 11.2 4 13 3" />
              </svg>
              <span className="post-toc-label">{heading.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

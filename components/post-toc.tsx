'use client'

import { animate, stagger } from 'motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import type { PostRailNode } from '~/lib/content'

const DESKTOP_QUERY = '(min-width: 64rem)'
const DESKTOP_EXIT_DURATION = 0.2
const DESKTOP_EXIT_STAGGER_WINDOW = 0.06
const EASE_SWIFT = [0.2, 0.8, 0.2, 1] as const
const PHONE_QUERY = '(max-width: 39.99rem)'
const TARGET_OFFSET = 100
const RAIL_ID = 'post-document-minimap'

function getReadingTop(target: HTMLElement) {
  const rectTop = target.getBoundingClientRect().top
  const transform = window.getComputedStyle(target).transform
  if (transform === 'none') return rectTop

  // RevealScope gives unread prose a temporary 5px translate. Navigation and
  // scroll-spy should use the heading's settled layout position instead.
  return rectTop - new DOMMatrixReadOnly(transform).m42
}

export function PostToc({ nodes }: { nodes: PostRailNode[] }) {
  const landmarks = useMemo(
    () =>
      nodes.filter(
        (node): node is Extract<PostRailNode, { kind: 'landmark' }> => node.kind === 'landmark',
      ),
    [nodes],
  )
  const phoneNodes = useMemo(() => {
    const firstHeading = nodes.findIndex(
      (node) => node.kind === 'landmark' && node.variant === 'heading',
    )
    return firstHeading > 0 ? nodes.slice(firstHeading) : nodes
  }, [nodes])
  const [open, setOpen] = useState(false)
  const [desktop, setDesktop] = useState(false)
  const [phone, setPhone] = useState(false)
  const [phoneQueryReady, setPhoneQueryReady] = useState(false)
  const [phoneIslandVisible, setPhoneIslandVisible] = useState(false)
  const [active, setActive] = useState(landmarks[0]?.id)
  const activeRef = useRef(active)
  const progressCircleRef = useRef<SVGCircleElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const nodeAnimationRef = useRef<ReturnType<typeof animate> | null>(null)
  const desktopEntrancePlayedRef = useRef(false)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  function animateOpenState(nextOpen: boolean, pinRenderedState = false) {
    if (nextOpen === open) return

    const items = rootRef.current?.querySelectorAll<HTMLElement>('.post-minimap-node')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reducedMotion) {
      nodeAnimationRef.current?.cancel()
      nodeAnimationRef.current = null
      setOpen(nextOpen)
      return
    }

    nodeAnimationRef.current?.stop()
    if (!items?.length) {
      nodeAnimationRef.current = null
      setOpen(nextOpen)
      return
    }

    const closingDesktop = desktop && !nextOpen
    const furthestCenterIndex = Math.ceil((items.length - 1) / 2)
    const desktopExitStagger =
      furthestCenterIndex > 0
        ? Math.min(0.01, DESKTOP_EXIT_STAGGER_WINDOW / furthestCenterIndex)
        : 0

    if (closingDesktop || pinRenderedState) {
      for (const item of items) {
        const style = window.getComputedStyle(item)
        item.style.opacity = style.opacity
        item.style.transform = style.transform
      }
    }

    const animation = animate(
      items,
      {
        opacity: nextOpen ? 1 : 0,
        transform: nextOpen
          ? 'translateY(0) rotate(0deg)'
          : 'translateY(-8px) rotate(2deg)',
      },
      {
        duration: closingDesktop ? DESKTOP_EXIT_DURATION : nextOpen ? 0.26 : 0.2,
        delay: stagger(closingDesktop ? desktopExitStagger : nextOpen ? 0.012 : 0.01, {
          from: 'center',
        }),
        ease: closingDesktop ? EASE_SWIFT : [0.23, 0.88, 0.26, 0.92],
      },
    )
    nodeAnimationRef.current = animation
    flushSync(() => setOpen(nextOpen))

    void animation.finished
      .then(() => {
        if (nodeAnimationRef.current !== animation) return
        animation.cancel()
        nodeAnimationRef.current = null
      })
      .catch(() => undefined)
  }

  useEffect(
    () => () => {
      nodeAnimationRef.current?.stop()
    },
    [],
  )

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    let frame = 0
    const sync = () => {
      setDesktop(query.matches)

      if (query.matches && !desktopEntrancePlayedRef.current) {
        if (frame) window.cancelAnimationFrame(frame)
        frame = window.requestAnimationFrame(() => {
          frame = 0
          desktopEntrancePlayedRef.current = true
          animateOpenState(true, true)
        })
        return
      }

      setOpen(query.matches)
    }
    sync()
    query.addEventListener('change', sync)
    return () => {
      query.removeEventListener('change', sync)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY)
    const sync = () => {
      setPhone(query.matches)
      setPhoneQueryReady(true)
    }
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!open || desktop) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      animateOpenState(false)
      toggleRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      animateOpenState(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [desktop, open])

  useEffect(() => {
    if (!phone || phoneIslandVisible || !open) return
    setOpen(false)
  }, [open, phone, phoneIslandVisible])

  useEffect(() => {
    const targets = landmarks
      .map((node) => document.getElementById(node.id))
      .filter((element): element is HTMLElement => element !== null)
    if (targets.length === 0) return

    let frame = 0
    const measure = () => {
      frame = 0
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0
      progressCircleRef.current?.setAttribute('stroke-dasharray', `${progress} 1`)
      const titleCard = document.querySelector('.post-title-card')
      setPhoneIslandVisible(
        titleCard ? titleCard.getBoundingClientRect().bottom <= TARGET_OFFSET : window.scrollY > 1,
      )

      let current = targets[0].id
      for (const target of targets) {
        if (getReadingTop(target) <= TARGET_OFFSET + 1) current = target.id
        else break
      }
      if (window.scrollY <= 1) current = targets[0].id
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = targets[targets.length - 1].id
      }
      if (current !== activeRef.current) setActive(current)
    }
    const requestMeasure = () => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', requestMeasure, { passive: true })
    window.addEventListener('resize', requestMeasure)
    return () => {
      window.removeEventListener('scroll', requestMeasure)
      window.removeEventListener('resize', requestMeasure)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [landmarks])

  function visitLandmark(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault()
    const target = document.getElementById(id)
    if (!target) return

    setActive(id)
    if (!desktop) animateOpenState(false)

    window.requestAnimationFrame(() => {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
      window.scrollTo({ top: window.scrollY + getReadingTop(target) - TARGET_OFFSET })
      history.replaceState(null, '', `#${id}`)
    })
  }

  if (landmarks.length < 2) return null

  const islandConcealed = !phoneQueryReady || (phone && !phoneIslandVisible)
  const displayedNodes = phone ? phoneNodes : nodes

  return (
    <div
      ref={rootRef}
      className="post-minimap-root"
      data-island-visible={phoneIslandVisible || undefined}
      data-open={open || undefined}
    >
      <div className="post-minimap-backdrop backdrop-blur-[8px]" aria-hidden />
      <div
        className="post-minimap-island backdrop-blur-[12px]"
        aria-hidden={islandConcealed || undefined}
        inert={islandConcealed ? true : undefined}
      >
        <button
          ref={toggleRef}
          type="button"
          className="post-minimap-toggle"
          aria-label={open ? '收起文章地图 / Close article map' : '展开文章地图 / Open article map'}
          aria-expanded={open}
          aria-controls={RAIL_ID}
          onClick={() => animateOpenState(!open)}
        >
          <svg
            className="post-minimap-progress"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            aria-hidden
          >
            <circle className="post-minimap-progress-track" cx="10" cy="10" r="8" />
            <circle
              ref={progressCircleRef}
              className="post-minimap-progress-value"
              cx="10"
              cy="10"
              r="8"
              pathLength="1"
              strokeDasharray="0 1"
            />
          </svg>
          <span className="post-minimap-toggle-label" aria-hidden>
            {landmarks[0].label}
          </span>
          <svg
            className="post-minimap-toggle-icon"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden
          >
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9.25 10.25H2.75C1.64543 10.25 0.75 9.35457 0.75 8.25V3.75C0.75 2.64543 1.64543 1.75 2.75 1.75H9.25C10.3546 1.75 11.25 2.64543 11.25 3.75V8.25C11.25 9.35457 10.3546 10.25 9.25 10.25Z" />
              <path
                className="post-minimap-toggle-panel"
                d="M3.25 4.25H4.25V7.75H3.25V4.25Z"
                fill="currentColor"
              />
              <path className="post-minimap-toggle-chevron" d="M8.25 7.5 6.75 6 8.25 4.5" />
            </g>
          </svg>
          <svg
            className="post-minimap-island-chevron"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden
          >
            <path d="M2.75 4.5 6 7.5 9.25 4.5" />
          </svg>
        </button>
        <nav
          id={RAIL_ID}
          className="post-minimap"
          aria-label="文章地图 / Article map"
          aria-hidden={!open}
          inert={open ? undefined : true}
        >
          <div className="post-minimap-phone-surface backdrop-blur-[12px]" aria-hidden />
          <div className="post-minimap-clip">
            <div className="post-minimap-nodes">
              {displayedNodes.map((node) => (
                <div key={node.key} className="post-minimap-node" data-kind={node.kind}>
                  {node.kind === 'tick' ? (
                    <span className="post-minimap-tick" aria-hidden />
                  ) : (
                    <a
                      href={`#${node.id}`}
                      data-variant={node.variant}
                      aria-current={active === node.id ? 'location' : undefined}
                      aria-label={node.label}
                      title={node.label}
                      onClick={(event) => visitLandmark(event, node.id)}
                    >
                      <span className="post-minimap-tick" aria-hidden />
                      <span className="post-minimap-label">{node.label}</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </div>
  )
}

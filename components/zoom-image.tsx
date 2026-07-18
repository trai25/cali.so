'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { localize, useLocale } from '~/lib/locale-client'

const VIEWPORT_PAD = 32

interface ZoomImageProps {
  src: string
  alt: string
  width: number
  height: number
  sizes?: string
  className?: string
  style?: React.CSSProperties
  native?: boolean
  srcSet?: string
  expandedContent?: React.ReactNode
}

// Click-to-zoom for post images: the photo is picked up off the page and
// floats over a dimmed sheet (FLIP, transform-only, interruptible).
// Esc / click / scroll put it back down. Reduced motion swaps instantly.
export function ZoomImage({
  src,
  alt,
  width,
  height,
  sizes,
  className,
  style,
  native = false,
  srcSet,
  expandedContent,
}: ZoomImageProps) {
  const locale = useLocale()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<{
    currentSrc: string
    target: { left: number; top: number; width: number; height: number }
    from: string
  } | null>(null)
  const [state, setState] = useState<'opening' | 'open' | 'closing'>('opening')
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const open = useCallback(() => {
    const img = triggerRef.current?.querySelector('img')
    if (!img) return
    const rect = img.getBoundingClientRect()

    // Fit within the viewport but never beyond the intrinsic size —
    // zoom means "actual size", not "stretch".
    const maxW = Math.min(window.innerWidth - VIEWPORT_PAD * 2, width)
    const detailSpace = expandedContent ? 152 : 0
    const maxH = Math.max(
      1,
      Math.min(
        window.innerHeight - VIEWPORT_PAD * 2 - detailSpace,
        height,
      ),
    )
    const scale = Math.min(maxW / width, maxH / height)
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)
    const target = {
      left: Math.round((window.innerWidth - w) / 2),
      top: Math.round((window.innerHeight - h) / 2),
      width: w,
      height: h,
    }

    // Transform that maps the floating image back onto its inline spot
    const s = rect.width / w
    const tx = rect.left + rect.width / 2 - (target.left + w / 2)
    const ty = rect.top + rect.height / 2 - (target.top + h / 2)
    setZoom({
      currentSrc: img.currentSrc || src,
      target,
      from: `translate(${tx}px, ${ty}px) scale(${s})`,
    })
    setState('opening')
  }, [src, width, height, expandedContent])

  const unmount = useCallback(() => {
    setZoom(null)
    setState('opening')
    triggerRef.current?.focus({ preventScroll: true })
  }, [])

  const close = useCallback(() => {
    // Nothing to reverse if the enter transition never started, and
    // reduced motion never fires transitionend — unmount directly.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || stateRef.current === 'opening') {
      unmount()
      return
    }
    if (stateRef.current !== 'open') return
    // The page may have moved since open (keyboard scroll, scrollbar drag):
    // re-measure the inline spot so the return flight lands where it now is.
    const img = triggerRef.current?.querySelector('img')
    if (img) {
      const rect = img.getBoundingClientRect()
      setZoom((prev) => {
        if (!prev) return prev
        const s = rect.width / prev.target.width
        const tx = rect.left + rect.width / 2 - (prev.target.left + prev.target.width / 2)
        const ty = rect.top + rect.height / 2 - (prev.target.top + prev.target.height / 2)
        return { ...prev, from: `translate(${tx}px, ${ty}px) scale(${s})` }
      })
    }
    setState('closing')
  }, [unmount])

  // Promote opening -> open one frame later so the transform transition runs
  useEffect(() => {
    if (!zoom || state !== 'opening') return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setState('open')))
    return () => cancelAnimationFrame(raf)
  }, [zoom, state])

  // Focus the dialog while open; belt-and-braces unmount if the close
  // transition's end event is ever missed.
  useEffect(() => {
    if (zoom && state === 'open') overlayRef.current?.focus({ preventScroll: true })
    if (state !== 'closing') return
    const t = setTimeout(unmount, 450)
    return () => clearTimeout(t)
  }, [zoom, state, unmount])

  useEffect(() => {
    if (!zoom) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      // image-only dialog: the overlay is the sole focusable — keep Tab inside
      if (e.key === 'Tab') e.preventDefault()
    }
    // A scroll gesture still dismisses the print, but never moves the page:
    // the sheet stays frozen while the photo is up (and through its return
    // flight), so the FLIP landing spot stays honest.
    const onGesture = (e: Event) => {
      e.preventDefault()
      close()
    }
    // Scrolls that bypass wheel/touch (keyboard, scrollbar drag) still close;
    // close() re-measures the landing spot, so the flight stays correct.
    const onScroll = () => close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onGesture, { passive: false })
    window.addEventListener('touchmove', onGesture, { passive: false })
    window.addEventListener('scroll', onScroll)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onGesture)
      window.removeEventListener('touchmove', onGesture)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [zoom, close])

  const settle = () => {
    if (stateRef.current === 'closing') unmount()
  }

  const floating = state === 'open'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="zoom-trigger"
        style={style}
        aria-label={
          alt
            ? localize(locale, `放大图片：${alt}`, `Zoom image: ${alt}`)
            : localize(locale, '放大图片', 'Zoom image')
        }
        data-zoomed={zoom ? '' : undefined}
        onClick={open}
      >
        {native ? (
          // Bunny is the public binary cache layer for Published Photo Selections.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            srcSet={srcSet}
            alt={alt}
            width={width}
            height={height}
            sizes={sizes}
            className={className}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            sizes={sizes}
            className={className}
          />
        )}
      </button>
      {zoom &&
        createPortal(
          <div
            ref={overlayRef}
            tabIndex={-1}
            className="zoom-overlay"
            data-state={floating ? 'open' : state}
            role="dialog"
            aria-modal="true"
            aria-label={alt || localize(locale, '图片', 'Image')}
            onClick={close}
          >
            <div className="zoom-overlay-backdrop" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoom.currentSrc}
              alt={alt}
              style={{
                left: zoom.target.left,
                top: zoom.target.top,
                width: zoom.target.width,
                height: zoom.target.height,
                transform: floating ? 'none' : zoom.from,
              }}
              onTransitionEnd={settle}
            />
            <div
              aria-hidden
              className="zoom-overlay-marks calibration-corners"
              style={
                {
                  left: zoom.target.left - 10,
                  top: zoom.target.top - 10,
                  width: zoom.target.width + 20,
                  height: zoom.target.height + 20,
                  '--corner-arm': '11px',
                } as React.CSSProperties
              }
            />
            {expandedContent && (
              <div className="zoom-overlay-details">{expandedContent}</div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

'use client'

import Image from 'next/image'
import { useState } from 'react'

import { books } from '~/lib/personal'

const COVER_W = 148
const CLAMP = 3.4

// deterministic base lean 0.65–1.55°, alternating direction
function baseLean(i: number, title: string): number {
  let h = 0
  for (let c = 0; c < title.length; c++) h = (h * 31 + title.charCodeAt(c)) | 0
  const mag = 0.65 + (Math.abs(h) % 90) / 100
  return i % 2 ? -mag : mag
}

// Accordion bookshelf: one book open at a time showing its cover; the
// others stand as spines and lean toward the open book (harder when
// adjacent, decaying with distance). Clicking a closed spine swaps which
// book is open — everything settles together over 650ms. Clicking the
// open book follows its link if it has one.
export function Bookshelf() {
  const [open, setOpen] = useState(0)
  if (books.length === 0) return null

  return (
    <div className="shelf3" role="list" aria-label="书架">
      {books.map((book, i) => {
        const isOpen = i === open
        let tilt = 0
        if (!isOpen) {
          const d = Math.abs(i - open)
          const toward = i < open ? 1 : -1
          const lean =
            Math.abs(baseLean(i, book.title)) * Math.max(0.7, 1 - 0.04 * d) +
            Math.max(0, 1.85 - 0.26 * d)
          tilt = Math.max(-CLAMP, Math.min(CLAMP, toward * lean))
        }
        const spine = book.spine ?? 24
        const content = (
          <span className="book3-inner" style={{ transform: `rotateY(${isOpen ? 0 : -90}deg)` }}>
            <span className="book3-cover">
              {book.art ? (
                <Image src={book.art} alt="" width={COVER_W} height={210} sizes={`${COVER_W}px`} />
              ) : (
                <span className="book3-cover-blank">
                  <b>{book.title}</b>
                  {book.author}
                </span>
              )}
            </span>
            <span className="book3-spine" style={{ width: spine, '--book-tone': book.tone ?? 0 } as React.CSSProperties}>
              <span className="book3-spine-title">{book.title}</span>
              <span className="book3-spine-author">{book.author}</span>
            </span>
          </span>
        )

        if (isOpen && book.url) {
          return (
            <a
              key={book.title}
              role="listitem"
              href={book.url}
              target="_blank"
              rel="noreferrer"
              className="book3"
              data-open
              aria-label={`${book.title} — ${book.author}（打开链接）`}
              style={{ width: COVER_W, transform: 'rotate(0deg)', zIndex: 2 }}
            >
              {content}
            </a>
          )
        }
        return (
          <button
            key={book.title}
            role="listitem"
            type="button"
            className="book3"
            data-open={isOpen || undefined}
            aria-expanded={isOpen}
            aria-label={`${book.title} — ${book.author}`}
            style={{
              width: isOpen ? COVER_W : spine,
              transform: `rotate(${tilt.toFixed(2)}deg)`,
              zIndex: isOpen ? 2 : undefined,
            }}
            onClick={() => setOpen(i)}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}

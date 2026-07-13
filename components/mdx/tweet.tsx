import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import Image from 'next/image'

import { LocalDate, T } from '~/lib/i18n'

interface TweetSnapshot {
  id: string
  url: string
  lang?: string
  author: { name: string; handle: string }
  createdAt: string
  text: string
  media?: 'video' | 'photo'
}

function XGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="tweet-card-x">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  )
}

// Tweets are archived at port time as ./tweet-<id>.json next to the post
// and rendered fully static — no client embed, no third-party requests.
// Drop tweet-<id>-avatar.(jpg|png) next to the snapshot to replace the
// initial-letter avatar with the real one.
export function Tweet({ slug, id }: { slug: string; id: string }) {
  const dir = path.join(process.cwd(), 'content/blog', slug)
  const tweet: TweetSnapshot = JSON.parse(readFileSync(path.join(dir, `tweet-${id}.json`), 'utf8'))
  const avatarFile = ['jpg', 'png'].find((ext) => existsSync(path.join(dir, `tweet-${id}-avatar.${ext}`)))

  return (
    <a className="tweet-card" href={tweet.url} target="_blank" rel="noreferrer">
      <span className="tweet-card-head">
        {avatarFile ? (
          <Image
            src={`/content/blog/${slug}/tweet-${id}-avatar.${avatarFile}`}
            alt=""
            width={40}
            height={40}
            className="tweet-card-avatar"
          />
        ) : (
          <span className="tweet-card-avatar" aria-hidden>
            {tweet.author.name.charAt(0)}
          </span>
        )}
        <span className="tweet-card-names">
          <span className="tweet-card-name">{tweet.author.name}</span>
          <span className="tweet-card-handle">@{tweet.author.handle}</span>
        </span>
        <XGlyph />
      </span>
      <span className="tweet-card-body" lang={tweet.lang}>
        {tweet.text.split('\n\n').map((paragraph, i) => (
          <span key={i} className="block">
            {paragraph}
          </span>
        ))}
      </span>
      <span className="tweet-card-foot">
        <time dateTime={tweet.createdAt}><LocalDate date={new Date(tweet.createdAt)} /></time>
        {tweet.media === 'video' && <span><T zh="· 含视频" en="· Contains video" /></span>}
      </span>
    </a>
  )
}

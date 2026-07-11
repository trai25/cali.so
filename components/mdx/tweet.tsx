import { readFileSync } from 'node:fs'
import path from 'node:path'

import { formatDate } from '~/lib/date'

interface TweetSnapshot {
  id: string
  url: string
  lang?: string
  author: { name: string; handle: string }
  createdAt: string
  text: string
  media?: 'video' | 'photo'
}

// Tweets are archived at port time as ./tweet-<id>.json next to the post
// and rendered fully static — no client embed, no third-party requests.
export function Tweet({ slug, id }: { slug: string; id: string }) {
  const file = path.join(process.cwd(), 'content/blog', slug, `tweet-${id}.json`)
  const tweet: TweetSnapshot = JSON.parse(readFileSync(file, 'utf8'))

  return (
    <figure className="tweet-card">
      <blockquote cite={tweet.url} lang={tweet.lang}>
        {tweet.text.split('\n\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </blockquote>
      <figcaption>
        <span className="tweet-card-author">{tweet.author.name}</span>{' '}
        <a href={tweet.url} target="_blank" rel="noreferrer">
          @{tweet.author.handle} ·{' '}
          <time dateTime={tweet.createdAt}>{formatDate(new Date(tweet.createdAt))}</time>
        </a>
        {tweet.media === 'video' && <span className="tweet-card-media">（视频）</span>}
      </figcaption>
    </figure>
  )
}

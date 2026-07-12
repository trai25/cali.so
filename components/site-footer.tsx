import { readFileSync } from 'node:fs'
import path from 'node:path'

import Link from 'next/link'

import {
  GitHubCard,
  type GitHubSnapshot,
  type SocialSnapshot,
  TelegramCard,
  XCard,
  YouTubeCard,
} from '~/components/social-cards'
import { T } from '~/lib/i18n'

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'content', file), 'utf8')) as T
}

function Tree({
  zh,
  en,
  children,
}: {
  zh: string
  en: string
  children: React.ReactNode
}) {
  return (
    <div className="footer-tree">
      <h2 className="footer-label">
        <T zh={zh} en={en} />
      </h2>
      <ul>{children}</ul>
    </div>
  )
}

// Swiss editorial footer, set as folder trees: each column is a directory
// listing with box-drawing connectors; the controls in 偏好 fill the
// column width (auto on mobile).
export function SiteFooter() {
  const social = readJson<{ x: SocialSnapshot; telegram: SocialSnapshot; youtube: SocialSnapshot }>(
    'social.json',
  )
  const github = readJson<GitHubSnapshot>('github.json')

  return (
    <footer className="mx-auto mt-24 w-full max-w-[37.5rem] px-6 pb-12 text-sm text-muted-foreground">
      <div className="hairline-top grid grid-cols-2 gap-x-6 gap-y-8 pt-8">
        <Tree zh="社交" en="social">
          <li>
            <XCard data={social.x} />
          </li>
          <li>
            <TelegramCard data={social.telegram} />
          </li>
          <li>
            <YouTubeCard data={social.youtube} />
          </li>
          <li>
            <GitHubCard data={github} />
          </li>
        </Tree>
        <Tree zh="索引" en="index">
          <li>
            <Link href="/" className="footer-tree-link">
              <T zh="首页" en="Home" />
            </Link>
          </li>
          <li>
            <Link href="/projects" className="footer-tree-link">
              <T zh="项目" en="Projects" />
            </Link>
          </li>
          <li>
            <Link href="/photos" className="footer-tree-link">
              <T zh="照片" en="Photos" />
            </Link>
          </li>
          <li>
            <Link href="/blog" className="footer-tree-link">
              <T zh="写作" en="Writing" />
            </Link>
          </li>
          <li>
            <a href="/feed.xml" className="footer-tree-link">
              RSS
            </a>
          </li>
        </Tree>
      </div>
      <div className="footer-colophon">
        <p>© {new Date().getFullYear()} Cali Castle</p>
      </div>
    </footer>
  )
}

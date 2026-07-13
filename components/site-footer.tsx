import Link from 'next/link'

import { FooterClock } from '~/components/footer-clock'
import {
  EmailCard,
  GitHubCard,
  type GitHubSnapshot,
  type SocialSnapshot,
  TelegramCard,
  XCard,
  YouTubeCard,
} from '~/components/social-cards'
import { T } from '~/lib/i18n'

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
export function SiteFooter({
  social,
  github,
}: {
  social: { x: SocialSnapshot; telegram: SocialSnapshot; youtube: SocialSnapshot }
  github: GitHubSnapshot
}) {
  return (
    <footer className="mx-auto mt-24 w-full max-w-[37.5rem] px-6 pb-24 text-sm text-muted-foreground sm:pb-12">
      <div className="hairline-top grid grid-cols-2 gap-x-6 gap-y-8 pt-8 sm:grid-cols-3">
        <Tree zh="联系" en="contact">
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
          <li>
            <EmailCard address="hi@cali.so" />
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
        <div className="footer-colophon col-span-2 sm:order-first sm:col-span-1">
          <p>© {new Date().getFullYear()} Cali Castle</p>
          <FooterClock />
        </div>
      </div>
    </footer>
  )
}

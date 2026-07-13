import type { Metadata } from 'next'

import { ExternalLabel } from '~/components/external-mark'
import { LocalizedMetadata } from '~/components/localized-metadata'
import { projects } from '~/lib/projects'
import { T } from '~/lib/i18n'

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Things Cali has made',
}

export default function ProjectsPage() {
  const center = (projects.length - 1) / 2
  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <LocalizedMetadata
        titleZh="项目"
        titleEn="Projects"
        descriptionZh="Cali 做过的一些东西"
        descriptionEn="Things Cali has made"
      />
      <h1 className="enter text-sm font-medium text-muted-foreground"><T zh="项目" en="Projects" /></h1>
      <ul className="mt-6 flex flex-col">
        {projects.map((project, index) => (
          <li
            key={project.name}
            className="enter-swing"
            style={
              { '--enter-delay': `${120 + Math.abs(index - center) * 50}ms` } as React.CSSProperties
            }
          >
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              className="hairline-top group grid grid-cols-12 items-start gap-x-4 py-4 text-sm"
            >
              <span className="col-span-4 min-w-0 font-medium transition-colors duration-150 ease-[ease] group-hover:text-foreground [&_.external-label]:max-w-full">
                <ExternalLabel><T zh={project.name} en={project.nameEn} /></ExternalLabel>
              </span>
              <span className="col-span-8 min-w-0 text-muted-foreground"><T zh={project.description} en={project.descriptionEn ?? project.description} /></span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

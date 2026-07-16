import Image from 'next/image'

import { ExternalLabel } from '~/components/external-mark'
import { T } from '~/lib/i18n'
import { projects } from '~/lib/projects'

export function ProjectsPageView() {
  const center = (projects.length - 1) / 2

  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <header className="max-w-[34rem]">
        <h1 className="enter text-sm font-medium text-muted-foreground">
          <T zh="项目" en="Projects" />
        </h1>
        <p
          className="page-introduction enter mt-4 text-balance"
          style={{ '--enter-delay': '70ms' } as React.CSSProperties}
        >
          <T
            zh="这些年做过的一些产品、开源工具和小实验。有些实用，有些只是好玩，但每一个我都认真做过。"
            en="A collection of products, open-source tools, and small experiments I’ve made over the years. Some useful, some playful, all made with care."
          />
        </p>
      </header>

      <ul className="focus-list mt-10 flex flex-col">
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
              className="project-row hairline-top group"
            >
              <span className="project-icon-frame" aria-hidden="true">
                <Image
                  src={project.icon}
                  alt=""
                  width={36}
                  height={36}
                  className="project-icon"
                />
              </span>
              <span className="project-identity">
                <span className="project-name font-medium">
                  <ExternalLabel>
                    <T zh={project.name} en={project.nameEn} />
                  </ExternalLabel>
                </span>
                <span className="project-domain text-muted-foreground">{project.domain}</span>
              </span>
              <span className="project-description text-muted-foreground">
                <T zh={project.description} en={project.descriptionEn ?? project.description} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

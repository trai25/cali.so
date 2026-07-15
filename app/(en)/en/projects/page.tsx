import { ProjectsPageView } from '../../../_views/projects-page'
import { localeMetadata } from '~/lib/locale-metadata'

export const metadata = localeMetadata({
  locale: 'en',
  path: '/projects',
  title: 'Projects',
  description: 'Products, open-source tools, and small experiments Cali has made over the years',
})

export default function EnglishProjectsPage() {
  return <ProjectsPageView />
}

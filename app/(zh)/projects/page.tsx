import { ProjectsPageView } from '../../_views/projects-page'
import { localeMetadata } from '~/lib/locale-metadata'

export const metadata = localeMetadata({
  locale: 'zh',
  path: '/projects',
  title: '项目',
  description: '这些年做过的一些产品、开源工具和小实验',
})

export default function ChineseProjectsPage() {
  return <ProjectsPageView />
}

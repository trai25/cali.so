'use client'

import { ErrorPageView, type ErrorBoundaryProps } from '../_views/error-page'

export default function ChineseError({ retry }: ErrorBoundaryProps) {
  return <ErrorPageView retry={retry} />
}

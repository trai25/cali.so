'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

import { Button } from '~/components/ui/button'
import { T } from '~/lib/i18n'

export function ErrorHomeAction() {
  return (
    <Button asChild size="md" leadingIcon={ChevronLeft}>
      <Link href="/">
        <T zh="返回首页" en="Go home" />
      </Link>
    </Button>
  )
}

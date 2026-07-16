import { Children, isValidElement, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/media',
}))

import { AdminShell } from './AdminShell'

describe('AdminShell', () => {
  it('uses compact grid chrome with a responsive sidebar', () => {
    const shell = AdminShell({
      children: <section>Media content</section>,
    })
    const sections = Children.toArray(shell.props.children).filter(
      isValidElement,
    ) as ReactElement<{ className: string; children?: React.ReactNode }>[]
    const nav = sections.find((section) => section.type === 'nav')
    const main = sections.find((section) => section.type === 'main')
    const links = Children.toArray(nav?.props.children).filter(
      isValidElement,
    ) as ReactElement<{
      href: string
      prefetch: boolean
      'aria-current'?: string
    }>[]

    expect(shell.props.className).toContain('grid')
    expect(shell.props.className).toContain('lg:grid-cols-[11rem_minmax(0,1fr)]')
    expect(nav?.props.className).toContain('grid')
    expect(nav?.props.className).toContain('lg:grid-cols-1')
    expect(main?.props.className).toContain('min-w-0')
    expect(main?.props.children).toEqual(<section>Media content</section>)
    expect(links).toHaveLength(3)
    expect(links.every((link) => link.props.prefetch === false)).toBe(true)
    expect(
      links
        .find((link) => link.props.href === '/admin/media')
        ?.props['aria-current'],
    ).toBe('page')
  })
})

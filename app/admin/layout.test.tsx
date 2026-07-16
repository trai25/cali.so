import { ClerkProvider } from '@clerk/nextjs'
import { describe, expect, it, vi } from 'vitest'

import { SiteDocument } from '../_components/site-document'
import AdminRootLayout from './layout'

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: vi.fn(),
}))

vi.mock('../_components/site-document', () => ({
  rootMetadata: {},
  SiteDocument: vi.fn(),
}))

describe('admin root layout', () => {
  it('provides Clerk session context inside the document body', () => {
    const children = <div>Admin</div>
    const layout = AdminRootLayout({ children })

    expect(layout.type).toBe(SiteDocument)
    expect(layout.props.children.type).toBe(ClerkProvider)
    expect(layout.props.children.props).toMatchObject({ children, dynamic: true })
  })
})

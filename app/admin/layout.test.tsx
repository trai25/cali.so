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
  it('keeps a non-dynamic Clerk provider inside the static document', () => {
    const children = <div>Admin</div>
    const layout = AdminRootLayout({ children })

    expect(layout.type).toBe(SiteDocument)
    expect(layout.props).toMatchObject({
      isAdmin: true,
      restoreLocale: true,
    })
    expect(layout.props.children.type).toBe(ClerkProvider)
    expect(layout.props.children.props.children).toBe(children)
    // `dynamic` must stay unset (false): opting in would force per-request
    // rendering and break the prerendered admin shell.
    expect(layout.props.children.props.dynamic).toBeUndefined()
  })
})

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorPageView } from './_views/error-page'
import { ForbiddenPageView } from './_views/forbidden-page'
import { NotFoundPageView } from './_views/not-found-page'
import GlobalError from './global-error'

vi.mock('geist/font/pixel', () => ({
  GeistPixelCircle: { className: 'pixel-circle' },
  GeistPixelSquare: { className: 'pixel-square' },
}))
vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: 'font-geist' }),
  Geist_Mono: () => ({ variable: 'font-geist-mono' }),
}))
vi.mock('next/font/local', () => ({
  default: () => ({ variable: 'font-frex-gb' }),
}))

afterEach(cleanup)

describe('public error recovery', () => {
  it('renders a deliberate bilingual owner-denied surface', () => {
    render(<ForbiddenPageView />)

    expect(screen.getByText('ADMIN / 403')).toBeTruthy()
    expect(screen.getByText('这个账户没有管理员权限。')).toBeTruthy()
    expect(screen.getByText('This account is not the site owner.')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /返回首页|Go home/ }).getAttribute('href'),
    ).toBe('/')
  })

  it('keeps the not-found proof sheet bilingual', () => {
    render(<NotFoundPageView />)

    expect(screen.getByText('错误 / 404')).toBeTruthy()
    expect(screen.getByText('页面偏离网格')).toBeTruthy()
    expect(screen.getByText('无印迹')).toBeTruthy()
  })

  it('offers retry and home recovery without exposing an error message', () => {
    const retry = vi.fn()

    render(<ErrorPageView retry={retry} />)

    expect(screen.queryByText('private database error')).toBeNull()
    expect(
      screen
        .getByRole('link', { name: /返回首页|Go home/ })
        .getAttribute('href'),
    ).toBe('/')
    fireEvent.click(screen.getByRole('button', { name: /重试|Try again/ }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('renders a self-contained global fallback without serializing internals', () => {
    const html = renderToStaticMarkup(
      <GlobalError
        error={new Error('private database error')}
        retry={() => undefined}
      />,
    )

    expect(html).toContain('<html')
    expect(html).toContain('<body')
    expect(html).toContain('This page did not print correctly.')
    expect(html).not.toContain('private database error')
  })
})

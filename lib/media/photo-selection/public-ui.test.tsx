// @vitest-environment jsdom

import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { NavCards, PhotoNavCard } from '../../../components/nav-cards'
import {
  PublishedPhotoWall,
  PublishedPhotoWallLoading,
} from '../../../components/published-photo-wall'
import {
  getHomepagePhotoPreview,
  type PublicPhotoSelection,
} from './repository'

function selection(count = 4): PublicPhotoSelection {
  return {
    revision: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    publishedAt: new Date('2026-07-15T12:00:00.000Z'),
    count,
    items: Array.from({ length: count }, (_, index) => ({
      id: `${String(index + 1).repeat(8)}-1111-4111-8111-111111111111`,
      width: index % 2 === 0 ? 4032 : 3024,
      height: index % 2 === 0 ? 3024 : 4032,
      altText: {
        zhHans: `第 ${index + 1} 张城市照片`,
        en: `City photograph ${index + 1}`,
      },
      renditions: [640, 1024, 1600].map((profileWidth) => ({
        profileWidth,
        src: `https://media.example.com/${index + 1}/${profileWidth}.jpg`,
        width: profileWidth,
        height: Math.round(profileWidth * 0.75),
      })),
      focalPoint: { x: 0.3 + index * 0.1, y: 0.6 },
      locationLabel: { zhHans: '台北', en: 'Taipei' },
      capturedAt: new Date('2025-05-08T00:00:00.000Z'),
      camera: {
        make: 'Apple',
        model: 'iPhone 16 Pro',
        lens: 'Main Camera',
        focalLengthMillimeters: 24,
        aperture: 1.8,
        shutterSpeedSeconds: 0.01,
        iso: 80,
      },
    })),
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete document.documentElement.dataset.locale
})

describe('Published Photo Selection UI', () => {
  it('renders natural-aspect Bunny images with localized Alt Text and summaries', () => {
    const html = renderToStaticMarkup(
      <PublishedPhotoWall selection={selection(1)} />,
    )

    expect(html).toContain('class="photo-masonry mt-6"')
    expect(html).toContain('width="4032"')
    expect(html).toContain('height="3024"')
    expect(html).toContain('alt="第 1 张城市照片"')
    expect(html).toContain('https://media.example.com/1/1600.jpg')
    expect(html).toContain('640w')
    expect(html).toContain('台北')
    expect(html).not.toContain('/_next/image')
    expect(html).not.toMatch(/latitude|longitude|originals\//i)
  })

  it('shows localized Display Metadata in the expanded photo interaction', () => {
    document.documentElement.dataset.locale = 'en'
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { getByRole, getByText } = render(
      <PublishedPhotoWall selection={selection(1)} />,
    )

    fireEvent.click(
      getByRole('button', { name: 'Zoom image: City photograph 1' }),
    )

    const dialog = getByRole('dialog', { name: 'City photograph 1' })
    expect(dialog).toBeTruthy()
    expect(within(dialog).getByText(/Taipei · May 8, 2025/)).toBeTruthy()
    expect(within(dialog).getByText('Apple iPhone 16 Pro')).toBeTruthy()
    expect(within(dialog).getByText('24 mm')).toBeTruthy()
    // capture details render as spec-plate label/value cells
    expect(within(dialog).getByText('ISO')).toBeTruthy()
    expect(within(dialog).getByText('80')).toBeTruthy()
    expect(dialog.querySelector('.spec-plate-flow')).toBeTruthy()
  })

  it('uses the first three photos and full count for the homepage card', () => {
    const published = selection(4)
    const html = renderToStaticMarkup(
      <NavCards
        postCount={9}
        projectCount={6}
        photoCard={
          <PhotoNavCard photoPreview={getHomepagePhotoPreview(published)} />
        }
      />,
    )

    expect(html).toContain('4 photos')
    expect(html).toContain('https://media.example.com/1/640.jpg')
    expect(html).toContain('https://media.example.com/2/640.jpg')
    expect(html).toContain('https://media.example.com/3/640.jpg')
    expect(html).not.toContain('https://media.example.com/4/640.jpg')
    expect(html).toContain('object-position:30% 60%')
  })

  it('reserves the homepage photo card while its selection streams', () => {
    const html = renderToStaticMarkup(
      <NavCards
        postCount={9}
        projectCount={6}
        photoCard={<PhotoNavCard photoPreview={null} pending />}
      />,
    )

    expect(html).toContain('aria-busy="true"')
    expect(html.match(/nc-polaroid-placeholder/g)).toHaveLength(3)
    expect(html).not.toContain('0 photos')
  })

  it('renders a calm empty state without a static fallback', () => {
    const html = renderToStaticMarkup(<PublishedPhotoWall selection={null} />)

    expect(html).toContain('No photos have been published yet.')
    expect(html).not.toContain('/images/photos/')
  })

  it('reserves a calm masonry shell while published photos stream', () => {
    const html = renderToStaticMarkup(<PublishedPhotoWallLoading />)

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading photos')
    expect(html.match(/photo-masonry-placeholder/g)).toHaveLength(6)
  })
})

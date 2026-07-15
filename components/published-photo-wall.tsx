'use client'

import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'
import type { PublicPhotoSelection } from '~/lib/media/photo-selection/repository'
import { tiltFromSlug } from '~/lib/polaroid'

import { ZoomImage } from './zoom-image'

type PublishedPhoto = PublicPhotoSelection['items'][number]

function captureDate(date: Date, locale: 'zh' | 'en') {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date))
}

function cameraDetails(photo: PublishedPhoto) {
  if (!photo.camera) return []
  return [
    [photo.camera.make, photo.camera.model].filter(Boolean).join(' ') || null,
    photo.camera.lens,
    photo.camera.focalLengthMillimeters
      ? `${photo.camera.focalLengthMillimeters} mm`
      : null,
    photo.camera.aperture ? `ƒ/${photo.camera.aperture}` : null,
    photo.camera.shutterSpeedSeconds
      ? photo.camera.shutterSpeedSeconds < 1
        ? `1/${Math.round(1 / photo.camera.shutterSpeedSeconds)} s`
        : `${photo.camera.shutterSpeedSeconds} s`
      : null,
    photo.camera.iso ? `ISO ${photo.camera.iso}` : null,
  ].filter((value): value is string => Boolean(value))
}

function PhotoDetails({ photo }: { photo: PublishedPhoto }) {
  const locale = useLocale()
  const location = photo.locationLabel?.[locale === 'zh' ? 'zhHans' : 'en']
  const captured = photo.capturedAt ? captureDate(photo.capturedAt, locale) : null
  const camera = cameraDetails(photo)
  if (!location && !captured && camera.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-xl px-5 text-foreground">
      {(location || captured) && (
        <p className="text-sm font-medium">
          {[location, captured].filter(Boolean).join(' · ')}
        </p>
      )}
      {camera.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <dt className="sr-only">
            <T zh="相机参数" en="Camera details" />
          </dt>
          {camera.map((detail) => (
            <dd key={detail}>{detail}</dd>
          ))}
        </dl>
      )}
    </div>
  )
}

function PublishedPhotoItem({
  photo,
  index,
  center,
}: {
  photo: PublishedPhoto
  index: number
  center: number
}) {
  const locale = useLocale()
  const alt = localize(locale, photo.altText.zhHans, photo.altText.en)
  const location = photo.locationLabel?.[locale === 'zh' ? 'zhHans' : 'en']
  const captured = photo.capturedAt ? captureDate(photo.capturedAt, locale) : null
  const rendition = photo.renditions.at(-1)!
  const srcSet = photo.renditions
    .map(({ src, profileWidth }) => `${src} ${profileWidth}w`)
    .join(', ')

  return (
    <div
      className="photo-item enter-swing"
      style={
        {
          '--enter-delay': `${120 + Math.abs(index - center) * 50}ms`,
          '--img-tilt': `${(tiltFromSlug(photo.id) / 2).toFixed(2)}deg`,
        } as React.CSSProperties
      }
    >
      <div className="group relative overflow-hidden rounded-md">
        <ZoomImage
          native
          src={rendition.src}
          srcSet={srcSet}
          alt={alt}
          width={photo.width}
          height={photo.height}
          sizes="(max-width: 704px) 50vw, 288px"
          className="rounded-md"
          expandedContent={<PhotoDetails photo={photo} />}
        />
        {(location || captured) && (
          <p className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-background/90 px-3 py-2 text-sm leading-5 opacity-0 backdrop-blur-sm transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transform-none motion-reduce:transition-none">
            {[location, captured].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}

export function PublishedPhotoWall({
  selection,
}: {
  selection: PublicPhotoSelection | null
}) {
  if (!selection || selection.items.length === 0) {
    return (
      <p className="mt-6 border-t border-dashed border-border py-10 text-sm leading-6 text-muted-foreground">
        <T zh="还没有发布照片。" en="No photos have been published yet." />
      </p>
    )
  }

  const center = (selection.items.length - 1) / 2
  return (
    <div className="photo-masonry mt-6">
      {selection.items.map((photo, index) => (
        <PublishedPhotoItem key={photo.id} photo={photo} index={index} center={center} />
      ))}
    </div>
  )
}

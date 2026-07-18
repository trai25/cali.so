'use client'

import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'
import type { PublicPhotoSelection } from '~/lib/media/photo-selection/repository'
import { tiltFromSlug } from '~/lib/polaroid'

import { ZoomImage } from './zoom-image'

type PublishedPhoto = PublicPhotoSelection['items'][number]

const LOADING_ASPECT_RATIOS = [
  '4 / 3',
  '3 / 4',
  '1 / 1',
  '3 / 4',
  '4 / 3',
  '1 / 1',
]

function captureDate(date: Date, locale: 'zh' | 'en') {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date))
}

// The capture data as spec-plate fields — EXIF was always plate content
function cameraFields(photo: PublishedPhoto) {
  if (!photo.camera) return []
  const camera = photo.camera
  const fields: { zh: string; en: string; value: string }[] = []
  const body = [camera.make, camera.model].filter(Boolean).join(' ')

  if (body) fields.push({ zh: '相机', en: 'Camera', value: body })
  if (camera.lens) fields.push({ zh: '镜头', en: 'Lens', value: camera.lens })
  if (camera.focalLengthMillimeters)
    fields.push({
      zh: '焦距',
      en: 'Focal',
      value: `${camera.focalLengthMillimeters} mm`,
    })
  if (camera.aperture)
    fields.push({ zh: '光圈', en: 'Aperture', value: `ƒ/${camera.aperture}` })
  if (camera.shutterSpeedSeconds)
    fields.push({
      zh: '快门',
      en: 'Shutter',
      value:
        camera.shutterSpeedSeconds < 1
          ? `1/${Math.round(1 / camera.shutterSpeedSeconds)} s`
          : `${camera.shutterSpeedSeconds} s`,
    })
  if (camera.iso)
    fields.push({ zh: '感光度', en: 'ISO', value: String(camera.iso) })

  return fields
}

function PhotoDetails({ photo }: { photo: PublishedPhoto }) {
  const locale = useLocale()
  const location = photo.locationLabel?.[locale === 'zh' ? 'zhHans' : 'en']
  const captured = photo.capturedAt ? captureDate(photo.capturedAt, locale) : null
  const fields = cameraFields(photo)
  if (!location && !captured && fields.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-xl px-5 text-foreground">
      {(location || captured) && (
        <p className="text-sm font-medium tabular-nums">
          {[location, captured].filter(Boolean).join(' · ')}
        </p>
      )}
      {fields.length > 0 && (
        <dl className="spec-plate spec-plate-flow mt-3">
          {fields.map((field) => (
            <div key={field.en}>
              <dt>
                <T zh={field.zh} en={field.en} />
              </dt>
              <dd>{field.value}</dd>
            </div>
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
      <div className="photo-frame group relative overflow-hidden rounded-md">
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
          <p className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-background/90 px-3 py-2 text-sm leading-5 tabular-nums opacity-0 backdrop-blur-sm transition-[opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transform-none motion-reduce:transition-none">
            {[location, captured].filter(Boolean).join(' · ')}
          </p>
        )}
        <span className="calibration-corners" aria-hidden />
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

export function PublishedPhotoWallLoading() {
  return (
    <div className="photo-masonry mt-6" role="status" aria-busy="true">
      <span className="sr-only">
        <T zh="正在加载照片" en="Loading photos" />
      </span>
      {LOADING_ASPECT_RATIOS.map((aspectRatio, index) => (
        <span
          key={index}
          className="photo-item photo-masonry-placeholder"
          style={{ aspectRatio }}
          aria-hidden
        />
      ))}
    </div>
  )
}

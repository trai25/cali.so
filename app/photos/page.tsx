import type { Metadata } from 'next'

import { ZoomImage } from '~/components/zoom-image'
import { T } from '~/lib/i18n'
import { photos } from '~/lib/photos'
import { tiltFromSlug } from '~/lib/polaroid'

export const metadata: Metadata = {
  title: '照片',
  description: 'Cali 的照片墙',
}


export default function PhotosPage() {
  const center = (photos.length - 1) / 2
  return (
    <div className="mx-auto w-full max-w-[37.5rem] px-6">
      <h1 className="enter text-sm font-medium text-muted-foreground">
        <T zh="照片" en="Photos" />
      </h1>
      <div className="photo-masonry mt-6">
        {photos.map((photo, index) => (
          <div
            key={photo.src}
            // Gabriel's tip: stagger from the center out, with a tiny swing
            className="photo-item enter-swing"
            style={
              {
                '--enter-delay': `${120 + Math.abs(index - center) * 50}ms`,
                '--img-tilt': `${(tiltFromSlug(photo.src) / 2).toFixed(2)}deg`,
              } as React.CSSProperties
            }
          >
            <ZoomImage
              src={photo.src}
              alt=""
              width={photo.width}
              height={photo.height}
              sizes="(max-width: 704px) 50vw, 288px"
              className="rounded-md"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

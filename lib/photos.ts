// Photo wall data (seed: the v1 hero collage) — /photos renders all of
// them, the home nav card fans the first few.
export interface Photo {
  src: string
  width: number
  height: number
}

export const photos: Photo[] = [
  { src: '/images/photos/photo-1.jpg', width: 1050, height: 1400 },
  { src: '/images/photos/photo-2.jpg', width: 1049, height: 1400 },
  { src: '/images/photos/photo-3.png', width: 1400, height: 1050 },
  { src: '/images/photos/photo-4.jpg', width: 1170, height: 1400 },
  { src: '/images/photos/photo-5.jpg', width: 1129, height: 1400 },
  { src: '/images/photos/photo-6.jpg', width: 1400, height: 1188 },
]

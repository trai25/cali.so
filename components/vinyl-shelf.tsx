import Image from 'next/image'

import { records } from '~/lib/personal'

function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// 2–3 seeded crease streaks per sleeve — worn paper, unique per album
function creases(seed: string): string {
  const h = hashOf(seed)
  const layers: string[] = []
  for (let i = 0; i < 3; i++) {
    const angle = 15 + ((h >> (i * 7)) % 150)
    const pos = 18 + ((h >> (i * 5)) % 64)
    const ink = i % 2 === 0
    layers.push(
      `linear-gradient(${angle}deg, transparent ${pos - 1.4}%, ${
        ink ? 'rgb(0 0 0 / 0.09)' : 'rgb(255 255 255 / 0.18)'
      } ${pos}%, transparent ${pos + 1.6}%)`,
    )
  }
  return layers.join(', ')
}

// Favorite records as worn paper sleeves — seeded creases + grain over the
// art, vinyl peeking out the top. Hover gives the sleeve a little more
// room and slides the disc further out. The disc never spins.
export function VinylShelf() {
  if (records.length === 0) return null
  return (
    <ul className="vinyl-shelf" aria-label="喜欢的唱片">
      {records.map((record) => (
        <li key={`${record.artist}-${record.album}`} className="vinyl">
          <a
            href={record.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`${record.artist} — ${record.album} (${record.year})`}
          >
            <span className="vinyl-disc" aria-hidden>
              <span className="vinyl-label" />
            </span>
            <span className="vinyl-sleeve" aria-hidden>
              {record.art ? (
                <Image src={record.art} alt="" width={200} height={200} sizes="128px" className="vinyl-art" />
              ) : (
                <>
                  <span className="vinyl-sleeve-raster">{`${record.album} `.repeat(24)}</span>
                  <span className="vinyl-sleeve-type">
                    <span className="vinyl-sleeve-album">{record.album}</span>
                    <span className="vinyl-sleeve-artist">{record.artist}</span>
                  </span>
                </>
              )}
              <span
                className="vinyl-creases"
                style={{ backgroundImage: creases(record.album + record.artist) }}
              />
              <span className="vinyl-paper" />
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

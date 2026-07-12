import { films } from '~/lib/personal'
import { T } from '~/lib/i18n'
import { tiltFromSlug } from '~/lib/polaroid'

// 电影 — admission ticket stubs: perforated paper slips scattered at
// seeded tilts that straighten on attention, like the post images.
export function FilmTickets() {
  return (
    <ul className="film-strip" aria-label="电影 / Films">
      {films.map((film) => (
        <li
          key={film.title}
          className="film-ticket"
          style={{ '--tilt': `${tiltFromSlug(film.title).toFixed(2)}deg` } as React.CSSProperties}
        >
          <span className="film-ticket-stub" aria-hidden>
            <T zh="入场券" en="Admit one" />
          </span>
          <span className="film-ticket-body">
            <span className="film-ticket-title">
              <T zh={film.title} en={film.titleEn ?? film.title} />
            </span>
            <span className="film-ticket-meta">
              <span className="tabular-nums">{film.year}</span> · {film.director}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

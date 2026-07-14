export type PostTransitionElement = 'cover' | 'title'

// View-transition names are CSS identifiers. Hash the content key instead of
// interpolating a stored slug into an inline style value.
export function postViewTransitionName(element: PostTransitionElement, slug: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < slug.length; index += 1) {
    hash ^= slug.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${element}-p${(hash >>> 0).toString(36)}`
}

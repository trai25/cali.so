// Paper grain + drafting-guide rules per the design language: the page reads
// as a sheet of working paper, not a void. Both layers are inert and tuned
// to be noticed on the second visit, not the first.
export function AmbientBackground() {
  return (
    <>
      <div aria-hidden className="paper-grain" />
      <div aria-hidden className="column-guides" />
    </>
  )
}

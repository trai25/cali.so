// The site's masthead stamp: a 2×2 dither cluster with one lit signal cell.
// The recurring home of the signal accent — a mark, never a control. Kept out
// of the accessibility tree; the page's real title carries the meaning.
export function PixelCluster({ className }: { className?: string }) {
  return (
    <span
      className={className ? `pixel-cluster ${className}` : 'pixel-cluster'}
      aria-hidden="true"
    />
  )
}

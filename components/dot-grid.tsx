// Ambient background per the design language: 24px cell, 1px dots, near the
// threshold of perception, fading out toward content-dense lower regions.
export function DotGrid() {
  return <div aria-hidden className="dot-grid" />
}

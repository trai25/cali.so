// @hugeicons/core-free-icons ships per-icon ESM files (used by the @fluid
// registry's icon-map for tree-shaking) but only a package-level index.d.ts,
// so deep imports resolve at runtime yet have no declarations. Cover them.
declare module '@hugeicons/core-free-icons/*' {
  import type { IconSvgElement } from '@hugeicons/react'
  const icon: IconSvgElement
  export default icon
}

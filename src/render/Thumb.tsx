import { memo, useMemo } from 'react'
import type { WElement } from '../model/types'
import { paintTree } from './paint'

/** Scaled, non-interactive wireframe preview. */
export const Thumb = memo(function Thumb({ root, w, h, width }: { root: WElement; w: number; h: number; width: number }) {
  const svg = useMemo(() => paintTree(root, w, h).svg, [root, w, h])
  const height = (width / w) * h
  return (
    <svg width={width} height={height} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <rect width={w} height={h} fill="#fff" />
      <g dangerouslySetInnerHTML={{ __html: svg }} />
    </svg>
  )
})

import type { CSSProperties } from 'react'

import { brand } from '@/lib/brand'

export function BrandMark({
  className,
  style,
  size = 28,
  color = 'currentColor'
}: {
  className?: string
  style?: CSSProperties
  size?: number
  color?: string
}) {
  return (
    <svg
      aria-hidden='true'
      className={className}
      width={size}
      height={size}
      style={style}
      viewBox='0 0 32 32'
      fill={color}
    >
      {brand.markPaths.map((path) => (
        <path key={path} d={path} fill={color} />
      ))}
    </svg>
  )
}

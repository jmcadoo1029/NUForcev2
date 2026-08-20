import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  pad?: boolean
  children: ReactNode
}

/** Surface container: white, soft border, subtle shadow. */
export function Card({ pad = true, style, children, ...rest }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding: pad ? 'var(--sp-5)' : 0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}

/** Small uppercase section label used at the top of cards. */
export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 'var(--fs-caption)',
        fontWeight: 700,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'var(--accent)',
        marginBottom: 'var(--sp-3)',
      }}
    >
      {children}
    </div>
  )
}

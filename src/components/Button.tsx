import type { ButtonHTMLAttributes, CSSProperties } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  small?: boolean
}

const base: CSSProperties = {
  fontFamily: 'inherit',
  fontWeight: 600,
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'background .12s, border-color .12s',
}

const variants: Record<Variant, CSSProperties> = {
  primary: { background: 'var(--accent)', color: '#fff' },
  secondary: { background: '#fff', color: 'var(--text)', borderColor: 'var(--border-strong)' },
  ghost: { background: 'none', color: 'var(--accent)' },
}

/** Themed button. One accent, three weights. */
export function Button({ variant = 'primary', small, style, ...rest }: ButtonProps) {
  return (
    <button
      style={{
        ...base,
        ...variants[variant],
        fontSize: small ? 'var(--fs-sm)' : 'var(--fs-base)',
        padding: small ? '7px 14px' : '11px 20px',
        ...style,
      }}
      {...rest}
    />
  )
}

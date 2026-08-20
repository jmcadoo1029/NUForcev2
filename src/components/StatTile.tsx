import type { ReactNode } from 'react'

interface StatTileProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'pos' | 'accent'
}

const toneColor: Record<NonNullable<StatTileProps['tone']>, string> = {
  default: 'var(--text)',
  pos: 'var(--pos)',
  accent: 'var(--accent)',
}

/** KPI tile for dashboards. */
export function StatTile({ label, value, sub, tone = 'default' }: StatTileProps) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--fs-caption)',
          fontWeight: 700,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'var(--dim)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, color: toneColor[tone] }}>
        {value}
      </div>
      {sub != null && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

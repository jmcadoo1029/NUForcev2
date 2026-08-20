interface TabsProps {
  tabs: string[]
  active: string
  onChange: (tab: string) => void
}

/** Underline tabs with one accent for the active tab. Larger hit targets. */
export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      {tabs.map((t) => {
        const on = t === active
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            style={{
              padding: '11px 18px',
              fontSize: 'var(--fs-base)',
              fontWeight: 600,
              color: on ? 'var(--accent)' : 'var(--muted)',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: '2.5px solid ' + (on ? 'var(--accent)' : 'transparent'),
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}

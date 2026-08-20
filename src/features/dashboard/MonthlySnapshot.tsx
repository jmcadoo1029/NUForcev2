import { useEffect, useState } from 'react'
import { Modal, StatTile } from '../../components'
import { money } from '../../lib/format'
import { loadMonthMetrics, type DashboardMetrics } from './useDashboardMetrics'
import { WonBreakdown } from './WonBreakdown'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Monthly snapshot ("Last Month") — full metrics for any past month, using the
// same net-of-revisions logic as the live tiles.
export function MonthlySnapshot({ onClose }: { onClose: () => void }) {
  const now = new Date()
  // Default to last month.
  const [sel, setSel] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [data, setData] = useState<DashboardMetrics | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    setData(null)
    setErr('')
    loadMonthMetrics(new Date(sel.year, sel.month, 1))
      .then((m) => alive && setData(m))
      .catch((e) => alive && setErr(String(e?.message || e)))
    return () => {
      alive = false
    }
  }, [sel])

  const years: number[] = []
  for (let y = now.getFullYear(); y >= 2016; y--) years.push(y)
  const isFuture = (y: number, mo: number) => y > now.getFullYear() || (y === now.getFullYear() && mo >= now.getMonth())

  const selectStyle = { fontFamily: 'inherit', fontSize: 'var(--fs-base)', fontWeight: 600, padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--text)', cursor: 'pointer' }

  return (
    <Modal title="Monthly snapshot" onClose={onClose} width={720}>
      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)', flexWrap: 'wrap' }}>
        <select value={sel.month} onChange={(e) => setSel((s) => ({ ...s, month: Number(e.target.value) }))} style={selectStyle}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i} disabled={isFuture(sel.year, i)}>{m}</option>
          ))}
        </select>
        <select value={sel.year} onChange={(e) => setSel((s) => ({ ...s, year: Number(e.target.value) }))} style={selectStyle}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {err && <div style={{ color: 'var(--accent)' }}>Couldn’t load: {err}</div>}
      {!err && !data && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {!err && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <StatTile label="Quoted (net)" value={money(data.quotedTotal)} sub={`${data.quotedCount} opportunities`} />
            <StatTile label="Avg quote" value={money(data.avgQuote)} sub={`${data.quotedCount} quotes`} />
            <StatTile label="Capture rate" value={`${data.capturePct}%`} sub={`${data.wonCount} won / ${data.quotedCount} quoted`} tone="pos" />
            <StatTile label="Closed Won" value={money(data.wonTotal)} sub={`${data.wonCount} quotes`} tone="accent" />
          </div>
          <WonBreakdown wonQuotes={data.wonQuotes} wonNewTotal={data.wonNewTotal} wonExistingTotal={data.wonExistingTotal} />
          <div style={{ height: 'var(--sp-2)' }} />
        </>
      )}
    </Modal>
  )
}

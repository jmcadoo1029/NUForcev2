import { useEffect, useMemo, useState } from 'react'
import { Modal, Button, useToast } from '../../components'
import { mineStandards, type MinerResult } from '../../lib/standardsMiner'

// Standards ↔ product-code miner UI. Runs the scan over all quotes, shows the
// learned table (which codes each cited standard tends to map to, weighted by how
// often), and exports it as JSON — the mapping file the offline test-plan reader
// will use. This runs in the browser with the user's session, so it stays inside
// the same data boundary the app already has (nothing new leaves).

const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'baseline', gap: 6, fontSize: 'var(--fs-caption)', fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: '1px solid var(--border-strong)', background: '#fff', whiteSpace: 'nowrap' }

export function StandardsMiner({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast()
  const [result, setResult] = useState<MinerResult | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('')
  const [includeAncillary, setIncludeAncillary] = useState(false)

  const run = (incAnc: boolean) => {
    setRunning(true); setErr(''); setProgress(0); setResult(null)
    mineStandards((n) => setProgress(n), { includeAncillary: incAnc })
      .then((r) => setResult(r))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setRunning(false))
  }
  useEffect(() => { run(includeAncillary) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const toggleAncillary = () => { const next = !includeAncillary; setIncludeAncillary(next); run(next) }

  const rows = useMemo(() => {
    if (!result) return []
    const f = filter.trim().toUpperCase()
    return f ? result.standards.filter((s) => s.standard.includes(f)) : result.standards
  }, [result, filter])

  const downloadJson = () => {
    if (!result) return
    try {
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nuforce-standards-map-${result.generatedAt.slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { showToast('Download failed: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000) }
  }
  const copyJson = async () => {
    if (!result) return
    try { await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); showToast('Mapping JSON copied', 'success') }
    catch { showToast('Couldn’t copy — use Download instead.', 'warn') }
  }

  return (
    <Modal title="Standards ↔ product codes" onClose={onClose} width={720}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', lineHeight: 1.55, marginBottom: 'var(--sp-3)' }}>
        Learned from your own quotes: for each standard cited in a quote’s specifications, these are the product codes that quote used — so the more often you’ve made a call, the higher its confidence. Export this as the mapping the document reader will use.
      </div>

      {running && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-3) 0' }}>Scanning quotes… {progress > 0 ? `${progress} read` : ''}</div>}
      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-3)' }}>Couldn’t run the scan: {err}</div>}

      {result && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)' }}>
              <b>{result.standards.length}</b> standards · from <b>{result.quotesWithStandards}</b> quotes with citations <span style={{ color: 'var(--dim)' }}>({result.quotesScanned} scanned)</span>
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-caption)', color: 'var(--muted)', cursor: 'pointer', marginLeft: 'auto' }}>
              <input type="checkbox" checked={includeAncillary} onChange={toggleAncillary} disabled={running} />
              Include reports / procedures / teardown
            </label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter standards…" style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', minWidth: 160 }} />
            <Button small variant="ghost" onClick={() => run(includeAncillary)} disabled={running}>Re-scan</Button>
            <Button small variant="ghost" onClick={copyJson}>Copy JSON</Button>
            <Button small onClick={downloadJson}>Download mapping</Button>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: 420, overflowY: 'auto' }}>
            {rows.length === 0 && <div style={{ padding: 'var(--sp-4)', color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No standards matched.</div>}
            {rows.map((s) => (
              <div key={s.standard} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{s.standard}</span>
                  <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>{s.quotes} quote{s.quotes !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {s.codes.length === 0 && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>no coded line items on those quotes</span>}
                  {s.codes.slice(0, 6).map((c, i) => (
                    <span key={c.code} style={{ ...chip, borderColor: i === 0 ? 'var(--accent)' : 'var(--border-strong)', background: i === 0 ? 'var(--accent-soft)' : '#fff' }}>
                      <b style={{ color: 'var(--accent)' }}>{c.code}</b>
                      <span>{c.label}</span>
                      <span style={{ color: 'var(--dim)' }}>· {c.count}× · {Math.round(c.confidence * 100)}% · lift {c.lift}</span>
                    </span>
                  ))}
                  {s.codes.length > 6 && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', alignSelf: 'center' }}>+{s.codes.length - 6} more</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 'var(--sp-2)' }}>
            Confidence = how often that code appeared on quotes citing this standard. Lift = how much more than chance (a common tag-along code like teardown has low lift). Codes are ranked by lift, so real associations rise to the top; reports/procedures/teardown are hidden unless you tick the box.
          </div>
        </>
      )}
    </Modal>
  )
}

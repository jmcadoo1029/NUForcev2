import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components'
import { money, fmtDate } from '../../lib/format'
import { fetchRevisions, fetchQuoteData, type RevisionRow } from '../../lib/quotes'
import { approvalInherited } from '../../lib/approval'
import { revDiff, wordDiff, type RevDiff, type FieldChange } from '../../data/revDiff'
import { lineItemsFromData, type DisplayLine } from '../../data/quoteModel'

// Revision-family viewer. Lists every quote sharing a base opportunity number
// (26-257, 26-257A, 26-257B…) with total / stage / approval status and a link to
// open any one. Each row expands inline to a diff against the prior revision:
// line items added/removed/re-priced and field/text changes. Read-only.

const APPROVAL_TONE: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'var(--warn)' },
  approved: { label: 'Approved', tone: 'var(--pos)' },
  rejected: { label: 'Rejected', tone: 'var(--accent)' },
}
const WON_TONE: Record<string, { label: string; tone: string }> = {
  pending_won: { label: 'Won pending', tone: 'var(--warn)' },
  won_approved: { label: 'Won', tone: 'var(--pos)' },
  won_rejected: { label: 'Won rejected', tone: 'var(--accent)' },
}

function Pill({ label, tone }: { label: string; tone: string }) {
  return <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: '#fff', background: tone, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{label}</span>
}

const COL_ADD = 'rgba(46,160,67,0.18)'
const COL_DEL = 'rgba(179,40,45,0.16)'

// One free-text field rendered as an inline word diff (adds green, dels struck red).
function TextDiff({ before, after }: { before: string; after: string }) {
  const toks = wordDiff(before, after)
  return (
    <div style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {toks.map((t, i) =>
        t.t === 'same' ? (
          <span key={i}>{t.s}</span>
        ) : t.t === 'add' ? (
          <span key={i} style={{ background: COL_ADD }}>{t.s}</span>
        ) : (
          <span key={i} style={{ background: COL_DEL, textDecoration: 'line-through', opacity: 0.8 }}>{t.s}</span>
        ),
      )}
    </div>
  )
}

function LineRow({ line, mark }: { line: DisplayLine; mark: '+' | '-' }) {
  const bg = mark === '+' ? COL_ADD : COL_DEL
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline', padding: '3px 6px', borderRadius: 6, background: bg }}>
      <span style={{ fontWeight: 800, width: 12, flexShrink: 0, color: mark === '+' ? 'var(--pos)' : 'var(--accent)' }}>{mark}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{line.label}</span>
        {line.desc ? <span style={{ color: 'var(--muted)' }}> — {line.desc}</span> : null}
      </span>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{money(line.price || 0)}</span>
    </div>
  )
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', margin: 'var(--sp-3) 0 var(--sp-2)' }}>{children}</div>
}

function ScalarChange({ f }: { f: FieldChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--sp-2)', padding: '4px 0', alignItems: 'baseline' }}>
      <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--dim)' }}>{f.label}</div>
      <div style={{ fontSize: 'var(--fs-sm)' }}>
        <span style={{ background: COL_DEL, textDecoration: 'line-through', opacity: 0.8, padding: '0 3px', borderRadius: 3 }}>{f.before || '—'}</span>
        <span style={{ color: 'var(--muted)', margin: '0 6px' }}>→</span>
        <span style={{ background: COL_ADD, padding: '0 3px', borderRadius: 3 }}>{f.after || '—'}</span>
      </div>
    </div>
  )
}

function DiffBody({ diff }: { diff: RevDiff }) {
  const { lines, fields } = diff
  const longFields = fields.filter((f) => f.long)
  const scalarFields = fields.filter((f) => !f.long)
  const anyLines = lines.added.length || lines.removed.length || lines.changed.length

  if (diff.empty) return <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>No differences from the prior revision.</div>

  return (
    <div>
      {(anyLines || diff.totalBefore !== diff.totalAfter) ? (
        <>
          <SubHead>Line items</SubHead>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {lines.changed.map((c, i) => (
              <div key={`c${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <LineRow line={c.before} mark="-" />
                <LineRow line={c.after} mark="+" />
              </div>
            ))}
            {lines.added.map((l, i) => <LineRow key={`a${i}`} line={l} mark="+" />)}
            {lines.removed.map((l, i) => <LineRow key={`r${i}`} line={l} mark="-" />)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
            <span style={{ color: 'var(--muted)' }}>Total</span>
            <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{money(diff.totalBefore)}</span>
            <span>→</span>
            <span>{money(diff.totalAfter)}</span>
          </div>
        </>
      ) : null}

      {scalarFields.length > 0 && (
        <>
          <SubHead>Details</SubHead>
          {scalarFields.map((f, i) => <ScalarChange key={i} f={f} />)}
        </>
      )}

      {longFields.map((f, i) => (
        <div key={i}>
          <SubHead>{f.label}</SubHead>
          <TextDiff before={f.before} after={f.after} />
        </div>
      ))}
    </div>
  )
}

// Loads the diff for one expanded revision (vs. the prior one). The base
// revision has no predecessor, so it shows its own line items as a baseline.
function ExpandedDiff({ id, prevId }: { id: string; prevId: string | null }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [diff, setDiff] = useState<RevDiff | null>(null)
  const [baseline, setBaseline] = useState<DisplayLine[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    setState('loading')
    Promise.all([fetchQuoteData(id), prevId ? fetchQuoteData(prevId) : Promise.resolve(null)])
      .then(([cur, prev]) => {
        if (!live) return
        if (prevId) setDiff(revDiff(prev, cur))
        else setBaseline(lineItemsFromData(cur))
        setState('ok')
      })
      .catch((e) => { if (live) { setErr(String(e?.message || e)); setState('error') } })
    return () => { live = false }
  }, [id, prevId])

  return (
    <div style={{ padding: 'var(--sp-3) var(--sp-4) var(--sp-4)', background: 'var(--bg, #fafbfc)', borderTop: '1px solid var(--border)' }}>
      {!prevId && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-2)' }}>Original revision — nothing before it to compare, showing its line items as the baseline.</div>}
      {state === 'loading' && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>Comparing…</div>}
      {state === 'error' && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)' }}>Couldn’t load this revision: {err}</div>}
      {state === 'ok' && (prevId
        ? diff && <DiffBody diff={diff} />
        : baseline.length === 0
          ? <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>No line items on this revision.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {baseline.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline', fontSize: 'var(--fs-sm)' }}>
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ fontWeight: 600 }}>{l.label}</span>{l.desc ? <span style={{ color: 'var(--muted)' }}> — {l.desc}</span> : null}</span>
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{money(l.price || 0)}</span>
                </div>
              ))}
            </div>
          )
      )}
    </div>
  )
}

export function RevisionHistory({
  opportunity,
  currentId,
  onClose,
}: {
  opportunity: string
  currentId: string
  onClose: () => void
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [rows, setRows] = useState<RevisionRow[]>([])
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchRevisions(opportunity)
      .then((r) => { if (live) { setRows(r); setState('ok') } })
      .catch((e) => { if (live) { setErr(String(e?.message || e)); setState('error') } })
    return () => { live = false }
  }, [opportunity])

  return (
    <Modal title="Revision history" onClose={onClose} width={640}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-4)' }}>
        All revisions in the {(opportunity || '').replace(/[A-Z]+$/, '') || 'this'} family. Expand any revision to see what changed from the one before it.
      </div>

      {state === 'loading' && <div style={{ color: 'var(--muted)' }}>Loading revisions…</div>}
      {state === 'error' && <div style={{ color: 'var(--accent)' }}>Couldn’t load revisions: {err}</div>}
      {state === 'ok' && rows.length === 0 && <div style={{ color: 'var(--muted)' }}>No other revisions found.</div>}

      {state === 'ok' && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {rows.map((r, i) => {
            const isCurrent = r.id === currentId
            const isOpen = expanded === r.id
            const opp = r.opportunity || '—'
            // An approved revision whose approval was inherited from an earlier
            // one still owes its own approval — flag it amber instead of green.
            const inherited = r.approval_status === 'approved' && approvalInherited(r.decidedAt, r.created_at)
            const a = inherited ? { label: 'Needs re-approval', tone: 'var(--warn)' } : APPROVAL_TONE[r.approval_status || '']
            const w = WON_TONE[r.won_approval_status || '']
            const prevId = i > 0 ? rows[i - 1].id : null
            return (
              <div key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', cursor: 'pointer',
                    background: isCurrent ? 'rgba(179,40,45,0.06)' : 'transparent',
                  }}
                >
                  <span style={{ width: 14, flexShrink: 0, color: 'var(--dim)', fontSize: 12, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>▶</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--fs-md)', fontWeight: isCurrent ? 800 : 700 }}>{opp}</span>
                      {isCurrent && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)' }}>Current</span>}
                    </div>
                    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 2 }}>
                      {r.stage || '—'}{r.updated_at ? ` · ${fmtDate(r.updated_at)}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {a && <Pill label={a.label} tone={a.tone} />}
                    {w && <Pill label={w.label} tone={w.tone} />}
                    <span style={{ fontSize: 'var(--fs-md)', fontWeight: 700, minWidth: 90, textAlign: 'right' }}>{money(Number(r.total) || 0)}</span>
                  </div>
                </div>
                {isOpen && <ExpandedDiff id={r.id} prevId={prevId} />}
                {isOpen && !isCurrent && (
                  <div style={{ padding: '0 var(--sp-4) var(--sp-3)', background: 'var(--bg, #fafbfc)' }}>
                    <Link to={`/quote/${encodeURIComponent(opp)}`} onClick={onClose} style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>Open {opp} →</Link>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

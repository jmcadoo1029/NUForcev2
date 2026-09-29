import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardLabel } from '../../components'
import { money, fmtDate } from '../../lib/format'
import { fetchRecentJobs, searchJobs, fetchJobQuotes, type JobSummary, type JobQuote } from '../../lib/jobs'

// Job Search — a job-centric view of past work. Search (or browse recent) jobs by
// number, customer, or quote number; open a job to see every quote on it, each with
// a description pulled from its Specifications section. Read-only; opening a quote
// navigates to the normal quote page. Grouped strictly by job number (won work).

function stageTone(stage: string | null): string {
  const s = stage || ''
  if (s.includes('Won')) return 'var(--pos)'
  if (s.includes('Lost') || s.includes('Cancelled')) return 'var(--accent)'
  return 'var(--info)'
}

const searchWrap: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)',
  border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '0 12px', maxWidth: 460,
}

// One quote inside a job: number + rev, stage, value, dates, and the spec snippet.
function QuoteCard({ q }: { q: JobQuote }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const open = () => navigate(`/quote/${encodeURIComponent(q.opportunity || q.id)}`)
  const specStyle: CSSProperties = {
    fontSize: 'var(--fs-sm)', color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap',
    ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }),
  }
  // Rough "is there more than ~3 lines" test so we only show the toggle when useful.
  const longSpec = q.spec.length > 180 || q.spec.split('\n').length > 3
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--surface)' }}>
      <button
        onClick={open}
        title="Open this quote"
        style={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'baseline', gap: 'var(--sp-3)', padding: '10px 14px', background: 'var(--bg)', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <span style={{ fontSize: 'var(--fs-base)', fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{q.opportunity || '—'}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-sm)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customer || '—'}</span>
        {q.stage && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: stageTone(q.stage), whiteSpace: 'nowrap' }}>{q.stage}</span>}
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{money(Number(q.total) || 0)}</span>
      </button>
      <div style={{ padding: '10px 14px' }}>
        {q.spec ? (
          <>
            <div style={specStyle}>{q.spec}</div>
            {longSpec && (
              <button
                onClick={() => setExpanded((e) => !e)}
                style={{ marginTop: 6, fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                {expanded ? 'Show less' : 'Show full specification'}
              </button>
            )}
          </>
        ) : (
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', fontStyle: 'italic' }}>No specification text on this quote.</div>
        )}
        <div style={{ marginTop: 8, fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>
          {q.created_at ? `Created ${fmtDate(q.created_at)}` : ''}{q.created_at && q.updated_at ? ' · ' : ''}{q.updated_at ? `Updated ${fmtDate(q.updated_at)}` : ''}
        </div>
      </div>
    </div>
  )
}

// The detail panel for one job: header stats + all its quotes.
function JobDetail({ jobNumber, onBack }: { jobNumber: string; onBack: () => void }) {
  const [quotes, setQuotes] = useState<JobQuote[] | null>(null)
  useEffect(() => {
    let alive = true
    setQuotes(null)
    fetchJobQuotes(jobNumber).then((q) => { if (alive) setQuotes(q) })
    return () => { alive = false }
  }, [jobNumber])

  const customers = useMemo(() => Array.from(new Set((quotes || []).map((q) => (q.customer || '').trim()).filter(Boolean))), [quotes])
  const total = (quotes || []).reduce((s, q) => s + (Number(q.total) || 0), 0)

  return (
    <Card>
      <button onClick={onBack} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--muted)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: 'var(--sp-3)' }}>← All jobs</button>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-2)' }}>
        <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>Job {jobNumber}</span>
        {customers.length > 0 && <span style={{ fontSize: 'var(--fs-base)', color: 'var(--muted)' }}>{customers[0]}{customers.length > 1 ? ` +${customers.length - 1} more` : ''}</span>}
      </div>
      {quotes && (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-4)' }}>
          {quotes.length} quote{quotes.length === 1 ? '' : 's'} · {money(total)} total
        </div>
      )}
      {!quotes && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading job…</div>}
      {quotes && quotes.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No quotes found on this job.</div>}
      {quotes && quotes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {quotes.map((q) => <QuoteCard key={q.id} q={q} />)}
        </div>
      )}
    </Card>
  )
}

// A row in the jobs list (default browse / search results).
function JobRow({ j, onOpen }: { j: JobSummary; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'baseline', gap: 'var(--sp-3)', padding: '11px 14px', background: 'var(--surface)', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface)')}
    >
      <span style={{ fontSize: 'var(--fs-base)', fontWeight: 800, color: 'var(--pos)', whiteSpace: 'nowrap' }}>Job {j.jobNumber}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {j.customer || '—'}{j.customerCount > 1 ? ` +${j.customerCount - 1}` : ''}
      </span>
      <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{j.quoteCount} quote{j.quoteCount === 1 ? '' : 's'}</span>
      <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', whiteSpace: 'nowrap' }}>{j.latest ? fmtDate(j.latest) : ''}</span>
    </button>
  )
}

export function JobSearch() {
  const [term, setTerm] = useState('')
  const [jobs, setJobs] = useState<JobSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const reqId = useRef(0)

  // Load recent jobs on mount and whenever the term is cleared; debounce searches.
  useEffect(() => {
    const mine = ++reqId.current
    setLoading(true)
    const run = term.trim().length >= 1 ? () => searchJobs(term) : () => fetchRecentJobs(30)
    const timer = setTimeout(() => {
      run()
        .then((r) => { if (reqId.current === mine) setJobs(r) })
        .catch(() => { if (reqId.current === mine) setJobs([]) })
        .finally(() => { if (reqId.current === mine) setLoading(false) })
    }, term ? 260 : 0)
    return () => clearTimeout(timer)
  }, [term])

  if (selected) return <JobDetail jobNumber={selected} onBack={() => setSelected(null)} />

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <CardLabel>Job Search</CardLabel>
        <div style={searchWrap}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: 'var(--dim)' }}>
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Job number, customer, or quote #…"
            autoFocus
            style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '9px 2px', width: '100%', minWidth: 200, color: 'var(--text)', background: 'none' }}
          />
        </div>
      </div>

      <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 'var(--sp-2)' }}>
        {term.trim() ? 'Matching jobs' : 'Recent jobs'}
      </div>

      {loading && !jobs && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-3) 0' }}>Loading…</div>}
      {jobs && jobs.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-3) 0' }}>
          {term.trim() ? `No jobs match “${term.trim()}”.` : 'No jobs found yet.'}
        </div>
      )}
      {jobs && jobs.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {jobs.map((j) => <JobRow key={j.jobNumber} j={j} onOpen={() => setSelected(j.jobNumber)} />)}
        </div>
      )}
    </Card>
  )
}

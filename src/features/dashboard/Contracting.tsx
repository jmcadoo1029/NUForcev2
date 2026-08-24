import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel, Button, Modal, useToast } from '../../components'
import { money } from '../../lib/format'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { prettifyEmail } from '../../lib/text'
import { globalSearch, type SearchQuote } from '../../lib/search'
import {
  loadContractingQuote, saveWonDetails, submitForWonApproval, buildProjectSource,
  type ContractingQuote, type ContractingWonInfo,
} from '../../lib/contracting'
import {
  createProjectFromNuforce, appendToProject, lookupProjectByJobNumber, setWorkspaceLink,
  workspaceProjectUrl, describeWorkspaceError, notifyClosedWon,
} from '../../lib/workspace'

// Contracting workspace — for managers + accounting (gated with the Manager view).
// Search any quote, then close it won (which submits for won-approval, the SAME
// rule as the quote page), capture the won details, and create or attach the
// Workspace project. All writes are targeted, so the quote's line items are safe.

const todayStr = () => new Date().toLocaleDateString('en-US')
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

const WON_BADGE: Record<string, { label: string; tone: string }> = {
  pending_won: { label: 'Won pending approval', tone: 'var(--warn)' },
  won_approved: { label: 'Won approved', tone: 'var(--pos)' },
  won_rejected: { label: 'Won rejected', tone: 'var(--accent)' },
}

const label: React.CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }
const inputStyle: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }

export function Contracting() {
  const { showToast } = useToast()
  const me = getSessionEmail() || ''

  const [term, setTerm] = useState('')
  const [results, setResults] = useState<SearchQuote[]>([])
  const [searching, setSearching] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quote, setQuote] = useState<ContractingQuote | null>(null)
  const [qLoading, setQLoading] = useState(false)
  const [won, setWon] = useState<ContractingWonInfo>({ wonDate: '', jobNum: '', poNum: '' })
  const [wsProjectId, setWsProjectId] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const seq = useRef(0)

  // Debounced search over all quotes.
  useEffect(() => {
    if (term.trim().length < 2) { setResults([]); return }
    setSearching(true)
    const id = setTimeout(() => {
      globalSearch(term)
        .then((r) => setResults(r.quotes))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 220)
    return () => clearTimeout(id)
  }, [term])

  const select = async (id: string) => {
    setSelectedId(id)
    setQuote(null)
    setQLoading(true)
    const myTurn = ++seq.current
    try {
      const q = await loadContractingQuote(id)
      if (myTurn !== seq.current) return
      if (!q) { showToast('Couldn’t load that quote.', 'error', 5000); return }
      setQuote(q)
      setWsProjectId(q.workspaceProjectId)
      // Prefill the won date to today when the quote doesn't have one yet.
      setWon({ ...q.wonInfo, wonDate: q.wonInfo.wonDate || todayStr() })
    } catch (e) {
      if (myTurn === seq.current) showToast('Couldn’t load that quote: ' + errMsg(e), 'error', 6000)
    } finally {
      if (myTurn === seq.current) setQLoading(false)
    }
  }

  const refresh = async () => { if (selectedId) await select(selectedId) }

  const wonStatus = quote?.wonApprovalStatus || 'none'
  const isClosedWon = (quote?.stage || '') === 'Closed Won'
  const canSubmitWon = wonStatus === 'none' || wonStatus === 'won_rejected'
  const linked = !!wsProjectId

  // ── Actions ────────────────────────────────────────────────────────────────
  const doSaveDetails = async () => {
    if (!quote || busy) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    if (!won.wonDate.trim()) { showToast('Enter the Won Date first.', 'warn', 4000); return }
    setBusy(true)
    try {
      await saveWonDetails(quote.id, won)
      showToast('Won details saved.', 'success')
      await refresh()
    } catch (e) { showToast('Save failed: ' + errMsg(e), 'error', 6000) } finally { setBusy(false) }
  }

  const doMarkClosedWon = async () => {
    if (!quote || busy) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    setBusy(true)
    try {
      await saveWonDetails(quote.id, won)
      await submitForWonApproval(quote.id, me)
      showToast(`${quote.opportunity || 'Quote'} marked Closed Won — sent for won approval.`, 'success', 5000)
      await refresh()
    } catch (e) { showToast('Couldn’t close it won: ' + errMsg(e), 'error', 7000) } finally { setBusy(false) }
  }

  const notifyWon = (q: ContractingQuote) =>
    notifyClosedWon({
      opportunity: q.opportunity || '', customer: q.customer || '',
      total: money(q.lines.reduce((a, l) => a + (l.price || 0), 0)),
      wonDate: won.wonDate || '', closedByName: prettifyEmail(me),
      linkUrl: 'https://nuforce.nulabs.com/',
    })

  const doCreateProject = async () => {
    if (!quote || busy) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    const jobNum = won.jobNum.trim()
    if (!jobNum) { showToast('Enter a Job # before creating a project.', 'error', 4000); return }
    setBusy(true)
    try {
      await saveWonDetails(quote.id, won)
      const lookup = await lookupProjectByJobNumber(jobNum)
      if (lookup?.found) { showToast(`Job # "${jobNum}" already exists on "${lookup.project_name}". Use Add to existing, or change the Job #.`, 'error', 8000); return }
      const result = await createProjectFromNuforce(buildProjectSource(quote, won))
      if (!result?.project_id) throw new Error('Project creation returned no project_id')
      await setWorkspaceLink(quote.id, result.project_id).catch(() => {})
      setWsProjectId(result.project_id)
      showToast(`Project "${jobNum}" created in Workspace (${result.task_count || 0} tasks, ${result.expense_count || 0} expenses)`, 'success', 5000)
      notifyWon(quote)
    } catch (e) {
      showToast(describeWorkspaceError(e, { accountName: quote.customer || '', actionLabel: 'create the project' }), 'error', 9000)
    } finally { setBusy(false) }
  }

  const doAddToExisting = async () => {
    if (!quote || busy) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    const jobNum = won.jobNum.trim()
    if (!jobNum) { showToast('Enter the existing project’s Job # first.', 'error', 4000); return }
    setBusy(true)
    try {
      const lookup = await lookupProjectByJobNumber(jobNum)
      if (!lookup?.found || !lookup.project_id) { showToast(`No Workspace project with Job # "${jobNum}". Check the Job # or use Create project.`, 'error', 7000); return }
      const taskCount = quote.lines.filter((l) => l.label || l.price).length
      if (!window.confirm(`Add this quote to existing project "${lookup.project_name}"?\n\nThis appends ${taskCount} task(s) and this quote's budget expenses to that project.`)) { showToast('Add to existing cancelled', 'warn'); return }
      await saveWonDetails(quote.id, won)
      const result = await appendToProject(buildProjectSource(quote, won))
      if (!result?.project_id) throw new Error('Append returned no project_id')
      await setWorkspaceLink(quote.id, result.project_id).catch(() => {})
      setWsProjectId(result.project_id)
      showToast(`Added to "${lookup.project_name}" (${result.tasks_added || 0} tasks, ${result.expenses_added || 0} expenses)`, 'success', 5000)
      notifyWon(quote)
    } catch (e) {
      showToast(describeWorkspaceError(e, { accountName: quote.customer || '', actionLabel: 'add to the existing project' }), 'error', 9000)
    } finally { setBusy(false) }
  }

  const doOpenWorkspace = () => {
    if (wsProjectId) window.open(workspaceProjectUrl(wsProjectId), '_blank', 'noopener,noreferrer')
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <Card style={{ marginBottom: 'var(--sp-4)' }}>
        <CardLabel>Contracting</CardLabel>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>
          Search any quote, close it won, capture the Job # / PO #, and build its Workspace project. Closing won submits it for won approval, same as the quote page.
        </div>
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by quote number, account, contact, or job number…" style={inputStyle} autoFocus />

        {term.trim().length >= 2 && (
          <div style={{ marginTop: 'var(--sp-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: 300, overflowY: 'auto' }}>
            {searching && results.length === 0 && <div style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Searching…</div>}
            {!searching && results.length === 0 && <div style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No matches.</div>}
            {results.map((r) => (
              <button key={r.id} onClick={() => select(r.id)} style={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'baseline', gap: 'var(--sp-3)', padding: '9px 12px', borderBottom: '1px solid var(--border)', background: selectedId === r.id ? 'var(--accent-soft)' : '#fff', border: 'none', borderLeft: selectedId === r.id ? '3px solid var(--accent)' : '3px solid transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{r.opportunity || '—'}</span>
                <span style={{ flex: 1, color: 'var(--muted)', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer || '—'}</span>
                {r.job_number && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--pos)' }}>Job {r.job_number}</span>}
                {r.stage && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>{r.stage}</span>}
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(Number(r.total) || 0)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selectedId && (
        <Card style={{ marginBottom: 'var(--sp-4)' }}>
          {qLoading && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading quote…</div>}
          {!qLoading && quote && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-1)' }}>
                <Link to={`/quote/${encodeURIComponent(quote.opportunity || quote.id)}`} style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--accent)', textDecoration: 'none' }}>{quote.opportunity || '—'}</Link>
                <span style={{ color: 'var(--muted)' }}>{quote.customer || '—'}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(Number(quote.total) || 0)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>Stage: <b style={{ color: 'var(--text)' }}>{quote.stage || '—'}</b></span>
                {WON_BADGE[wonStatus] && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#fff', background: WON_BADGE[wonStatus].tone, padding: '2px 10px', borderRadius: 20 }}>{WON_BADGE[wonStatus].label}</span>}
                {linked && <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--pos)', background: 'var(--pos-soft)', borderRadius: 20, padding: '2px 10px' }}>Linked to Workspace</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
                <div><div style={label}>Won Date</div><input value={won.wonDate} onChange={(e) => setWon({ ...won, wonDate: e.target.value })} placeholder="e.g. 3/18/2026" style={inputStyle} /></div>
                <div><div style={label}>Job #</div><input value={won.jobNum} onChange={(e) => setWon({ ...won, jobNum: e.target.value })} placeholder="e.g. J-2025-042" style={inputStyle} /></div>
                <div><div style={label}>PO #</div><input value={won.poNum} onChange={(e) => setWon({ ...won, poNum: e.target.value })} placeholder="e.g. PO-98765" style={inputStyle} /></div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                {canSubmitWon ? (
                  <Button small disabled={busy || !WRITES_ENABLED} onClick={() => setConfirmOpen(true)}>{busy ? 'Working…' : 'Mark Closed Won & submit for approval'}</Button>
                ) : (
                  <Button variant="secondary" small disabled={busy || !WRITES_ENABLED} onClick={doSaveDetails}>{busy ? 'Saving…' : 'Save won details'}</Button>
                )}
                {isClosedWon && (
                  linked ? (
                    <Button variant="primary" small disabled={busy} onClick={doOpenWorkspace}>Open in Workspace ↗</Button>
                  ) : (
                    <>
                      <Button variant="secondary" small disabled={busy || !WRITES_ENABLED} onClick={doCreateProject}>{busy ? 'Working…' : 'Create Workspace project'}</Button>
                      <Button variant="ghost" small disabled={busy || !WRITES_ENABLED} onClick={doAddToExisting}>Add to existing project</Button>
                    </>
                  )
                )}
              </div>
              {wonStatus === 'pending_won' && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)', marginTop: 'var(--sp-3)' }}>Awaiting won approval — an approver decides it in “Needs your attention” on the Manager dashboard.</div>}
              {!WRITES_ENABLED && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)', fontStyle: 'italic', marginTop: 'var(--sp-3)' }}>Preview — writes are off, so contracting actions won’t persist yet.</div>}
            </>
          )}
        </Card>
      )}

      {confirmOpen && quote && (
        <Modal title="Confirm Closed-Won date" onClose={() => setConfirmOpen(false)} width={440}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', lineHeight: 1.6, marginBottom: 'var(--sp-4)' }}>
            You&rsquo;re marking <b>{quote.opportunity || quote.id}</b> as <b>Closed Won</b> dated <b>{won.wonDate || '(no date)'}</b>. Is that date correct?
            <div style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>It goes to the won-approval queue for a manager to approve.</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <Button variant="ghost" small onClick={() => setConfirmOpen(false)}>Go back &amp; edit</Button>
            <Button variant="primary" small onClick={() => { setConfirmOpen(false); doMarkClosedWon() }}>Yes, mark Closed Won</Button>
          </div>
        </Modal>
      )}
    </>
  )
}

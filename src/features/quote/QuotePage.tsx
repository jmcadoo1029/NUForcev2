import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Card, CardLabel, Button, Modal, menuItemStyle, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { serializeQuote, saveQuote, type QuoteSaveModel } from '../../lib/quoteSave'
import { isRevisionChange, oppChangeInfo, resetApprovalForNewRevision } from '../../lib/quoteGuards'
import { persistApproval, persistWonApproval, requestReopen } from '../../lib/approvals'
import { fetchQuoteByKey, type QuoteRow } from '../../lib/quotes'
import { lineItemsFromData } from '../../data/quoteModel'
import { TI_DEFAULTS, QI_DEFAULTS, SETUP_FORM_DEFAULTS, STAGE_OPTS, type RelatedContact, type BudgetRow, type LineItem } from '../../data/quoteDefaults'
import { money } from '../../lib/format'
import { prettifyEmail } from '../../lib/text'
import { lookupProjectByJobNumber, createProjectFromNuforce, appendToProject, setWorkspaceLink, workspaceProjectUrl, notifyClosedWon, describeWorkspaceError, type ProjectSourceInput } from '../../lib/workspace'
import { fetchCrrWorkup, buildSpecPayloadFromCrr } from '../../lib/crr'
import { ProductPicker, type PickerLine } from './ProductPicker'
import { PricingCalculator, type CalcSelection } from './PricingCalculator'
import { ApprovalBar, type ApprovalState } from './ApprovalBar'
import { RevisionHistory } from './RevisionHistory'
import { QuoteActions, type ChatterEntry } from './QuoteActions'
import { SendComposer } from './SendComposer'
import { SentFiles } from './SentFiles'
import { ConvertToPicker, type ConvertedLine } from './ConvertToPicker'
import { ClosedWonDetails, type WonInfo } from './ClosedWonDetails'
import { cleanNotes, regInput } from './form/fields'
import { cleanSpecText } from '../../lib/specText'
import { RelatedContacts } from './form/RelatedContacts'
import { QuoteInfoCard } from './form/QuoteInfoCard'
import { TestItemCard } from './form/TestItemCard'
import { SpecsNotes } from './form/SpecsNotes'
import { LineItemsCard } from './form/LineItemsCard'
import { BudgetCard } from './form/BudgetCard'
import { fetchIsApprover } from '../../lib/perms'
import { getSessionEmail } from '../../lib/auth'
import { needsReapproval } from '../../lib/approval'

// Read-only quote detail — the full quote (info, test item, specs, notes, line
// items) loaded by row id. This is the skeleton the editable form (writes,
// Phase 7) will build on. The Product Picker + editing come next in Phase 3.

export function QuotePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [row, setRow] = useState<QuoteRow | null>(null)
  // Unified editable line items (existing + calculator/picker additions).
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const lineSeq = useRef(1)
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading')
  const [err, setErr] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  // Bumped after a successful send so the actions row + sent-files log reload.
  const [sendNonce, setSendNonce] = useState(0)
  // True once an imported quote's lines have been converted to picker lines this session.
  const [converted, setConverted] = useState(false)
  // Line items can be edited on their own, without the whole form being in edit mode.
  const [lineEditing, setLineEditing] = useState(false)
  // Catalog items handed from the calculator to the picker (pre-checked with the
  // suggested price). Null when the picker is opened directly.
  const [pickerSeed, setPickerSeed] = useState<CalcSelection[] | null>(null)
  const [pickerCustomSeed, setPickerCustomSeed] = useState<{ code: string; label: string; desc?: string; price: number }[] | null>(null)
  // Setup Details + Budget — real quote sections. Setup is shared with the
  // calculator (its source). Editable in edit mode; preview until Phase 7.
  const [setupEdit, setSetupEdit] = useState<Record<string, any>>({ ...SETUP_FORM_DEFAULTS })
  const [budgetEdit, setBudgetEdit] = useState<{ on: boolean; rows: BudgetRow[]; markup: string }>({ on: false, rows: [], markup: '25' })
  // Editable Test Item state — same field shape as Classic (dimL/W/H, volt +
  // pwrType, inrush, amps, the regulatory dropdowns…) so the calculator links to
  // size/weight/power stay intact. Edit mode shows Classic's inputs; view mode
  // renders it clean. Local preview until writes are enabled (Phase 7).
  const [tiEdit, setTiEdit] = useState<Record<string, any>>({ ...TI_DEFAULTS })
  const [qiEdit, setQiEdit] = useState<Record<string, any>>({ ...QI_DEFAULTS })
  // One page-level edit mode governs the quote number, Quote Info, and Test Item.
  const [editing, setEditing] = useState(false)
  const [revOpen, setRevOpen] = useState(false)
  const [specMenuOpen, setSpecMenuOpen] = useState(false)
  // Approval / won-approval workflow (seeded from the quote; actions preview until Phase 7).
  const [approval, setApproval] = useState<ApprovalState>({ status: 'none', history: [] })
  const [wonApproval, setWonApproval] = useState<ApprovalState>({ status: 'none', history: [] })
  const [locked, setLocked] = useState(false)
  const [reopenRequested, setReopenRequested] = useState(false)
  const [isApprover, setIsApprover] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  // Set when a save detects a revision-letter change — the modal asks new vs overwrite.
  const [revDecision, setRevDecision] = useState<{ oldRev: string; newRev: string } | null>(null)
  // Clone → a fresh quote copying this one's content under a new quote number.
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneOpp, setCloneOpp] = useState('')
  const [cloneBusy, setCloneBusy] = useState(false)
  // Closed-Won details + the Workspace project link (lifted here so Save persists
  // them and the Workspace payload uses the live values).
  const [wonInfo, setWonInfo] = useState<WonInfo>({ wonDate: '', jobNum: '', poNum: '' })
  // The Job # as it was when the quote loaded — an unchanged saved Job # means the
  // project presumably exists (button shows "Open"); a freshly-typed one means create.
  const [loadedJobNum, setLoadedJobNum] = useState('')
  const [workspaceProjectId, setWorkspaceProjectId] = useState<string | null>(null)
  const [wsBusy, setWsBusy] = useState(false)

  useEffect(() => {
    let alive = true
    // New quote: start blank in-memory (no DB row until first Save). id '' → insert.
    if (id === 'new') {
      setRow({ id: '', opportunity: null, customer: null, revision: null, stage: 'Proposal/Price Quote', total: null, data: {} } as QuoteRow)
      setLineItems([])
      setTiEdit({ ...TI_DEFAULTS })
      setQiEdit({ ...QI_DEFAULTS, date: new Date().toLocaleDateString('en-US'), stage: 'Proposal/Price Quote' })
      setSetupEdit({ ...SETUP_FORM_DEFAULTS })
      setBudgetEdit({ on: false, rows: [], markup: '25' })
      setApproval({ status: 'none', history: [] })
      setWonApproval({ status: 'none', history: [] })
      setWonInfo({ wonDate: '', jobNum: '', poNum: '' })
      setLoadedJobNum('')
      setWorkspaceProjectId(null)
      setLocked(false)
      setReopenRequested(false)
      setEditing(true)
      setState('ok')
      return () => { alive = false }
    }
    setState('loading')
    fetchQuoteByKey(id || '')
      .then((r) => {
        if (!alive) return
        if (!r) return setState('notfound')
        setRow(r)
        setLineItems(lineItemsFromData(r.data).map((l) => ({ key: lineSeq.current++, code: l.code || '', label: l.label, desc: l.desc, price: l.price, added: false })))
        const tiData = (r.data?.ti || {}) as Record<string, any>
        // Imported (Salesforce) specs/notes arrive as one unformatted blob, often
        // with encoding artifacts. Fix the encoding for every quote; additionally
        // split imported blobs to one-sentence-per-line so a manual edit is easier.
        const imported = r.source === 'salesforce'
        const cleanSpec = (t: unknown) => cleanSpecText(String(t ?? ''), imported)
        // Notes/specs: the dedicated `notes`/`specifications` columns are canonical
        // (shared with Classic and reliably written on save). The data.ti copies can
        // be normalized away by the shared backend, so for non-imports the column
        // wins and the blob is only a fallback; imports carry their text in the blob,
        // so prefer that. This is what keeps edited notes from vanishing on reload.
        const notesCol = String((r.notes ?? '') as string)
        const specsCol = String((r.specifications ?? '') as string)
        const blobNotes = String(tiData.tiNotes ?? '')
        const blobSpecs = String(tiData.tiSpecs ?? '')
        const pickText = (col: string, blob: string) => (imported ? (blob.trim() ? blob : col) : (col.trim() ? col : blob))
        // Strip the boilerplate paragraph from the editable notes first, then clean.
        setTiEdit({ ...TI_DEFAULTS, ...tiData, tiSpecs: cleanSpec(pickText(specsCol, blobSpecs)), tiNotes: cleanSpec(cleanNotes(pickText(notesCol, blobNotes))) })
        const q = (r.data?.qi || {}) as Record<string, any>
        setQiEdit({
          ...QI_DEFAULTS,
          ...q,
          opp: r.opportunity || q.opp || '',
          account: q.account || r.customer || '',
          stage: r.stage || q.stage || 'Proposal/Price Quote',
        })
        setSetupEdit({ ...SETUP_FORM_DEFAULTS, ...((r.data?.setup || {}) as Record<string, any>) })
        const b = (r.data?.budget || {}) as Record<string, any>
        setBudgetEdit({ on: !!b.on, rows: Array.isArray(b.rows) ? b.rows : [], markup: b.markup != null ? String(b.markup) : '25' })
        const won = (r.data?.wonInfo || {}) as Partial<WonInfo>
        setWonInfo({ wonDate: won.wonDate || '', jobNum: won.jobNum || '', poNum: won.poNum || '' })
        setLoadedJobNum(won.jobNum || '')
        setWorkspaceProjectId(((r.data as Record<string, unknown> | undefined)?.workspace_project_id as string | null) ?? null)
        // Seed approval state — the DB column wins, the blob supplies the detail.
        const ap = (r.data?.approval || {}) as ApprovalState
        const wa = (r.data?.wonApproval || {}) as ApprovalState
        // Salesforce imports arrive already approved, so treat them exactly like
        // an approved quote (no special case): approved status, locked, and an
        // approver reopens to edit via the same path as any approved quote.
        const isImport = r.source === 'salesforce'
        const aStatus = r.approval_status || ap.status || (isImport ? 'approved' : 'none')
        const wStatus = r.won_approval_status || wa.status || 'none'
        setApproval({ ...ap, status: aStatus, history: ap.history || [] })
        setWonApproval({ ...wa, status: wStatus, history: wa.history || [] })
        // Hard-lock while mid-approval or already approved (imports included), and
        // for won deals (Closed Won stage or won-approved) so completed quotes can't
        // be edited by accident. `editUnlocked` (set when an approver reopens) is the
        // deliberate override that keeps a reopened quote editable across reloads.
        const stg = r.stage || ((r.data?.qi as { stage?: string } | undefined)?.stage) || ''
        const isWonStage = stg === 'Closed Won'
        const editUnlocked = !!(r.data as { editUnlocked?: boolean } | undefined)?.editUnlocked
        const wonLock = (isWonStage || wStatus === 'won_approved') && !editUnlocked
        setLocked(aStatus === 'pending' || aStatus === 'approved' || wStatus === 'pending_won' || wonLock)
        setReopenRequested(((r.data?.reopenRequest as { status?: string } | undefined)?.status) === 'requested')
        setState('ok')
      })
      .catch((e) => {
        if (!alive) return
        setErr(String(e?.message || e))
        setState('error')
      })
    return () => {
      alive = false
    }
  }, [id])

  useEffect(() => {
    let alive = true
    fetchIsApprover().then((v) => alive && setIsApprover(v))
    return () => {
      alive = false
    }
  }, [])

  // Browser-tab title reflects the quote number being viewed (live as it's edited).
  useEffect(() => {
    const opp = s(qiEdit.opp) || row?.opportunity || ''
    document.title = opp ? `NUForce #${opp}` : 'NUForce'
    return () => { document.title = 'NUForce' }
  }, [qiEdit.opp, row?.opportunity])

  // Approval actions — persist directly (status column + data blob). Shared writer
  // with the dashboard queue; preview when writes are off.
  const me = getSessionEmail() || ''
  const now = () => new Date().toISOString()
  const hist = (a: ApprovalState, event: string, comments: string) => [...(a.history || []), { event, by: me, at: now(), comments }]

  const applyApproval = async (next: ApprovalState, lock: boolean, label: string, extraData?: Record<string, unknown>) => {
    // Any lock-imposing action clears the editUnlocked override so a re-locked quote
    // stays locked; unlock passes editUnlocked:true via extraData (lock=false).
    const extra = { ...(extraData || {}), ...(lock ? { editUnlocked: false } : {}) }
    setApproval(next)
    setLocked(lock)
    setRow((prev) => (prev ? { ...prev, approval_status: next.status, data: { ...(prev.data || {}), ...extra, approval: next } as typeof prev.data } : prev))
    if (!WRITES_ENABLED) { showToast(`${label} (preview)`, 'info'); return }
    if (!row) return
    try { await persistApproval(row.id, next, { ...((row.data || {}) as Record<string, unknown>), ...extra }); showToast(label, 'success') } catch (e) { showToast('Approval save failed: ' + errMsg(e), 'error', 6000) }
  }
  const applyWon = async (next: ApprovalState, lock: boolean, label: string) => {
    const extra = lock ? { editUnlocked: false } : {}
    setWonApproval(next)
    setLocked(lock)
    setRow((prev) => (prev ? { ...prev, won_approval_status: next.status, data: { ...(prev.data || {}), ...extra, wonApproval: next } as typeof prev.data } : prev))
    if (!WRITES_ENABLED) { showToast(`${label} (preview)`, 'info'); return }
    if (!row) return
    try { await persistWonApproval(row.id, next, { ...((row.data || {}) as Record<string, unknown>), ...extra }); showToast(label, 'success') } catch (e) { showToast('Won-approval save failed: ' + errMsg(e), 'error', 6000) }
  }

  const submitApproval = () => applyApproval({ status: 'pending', submittedBy: me, submittedAt: now(), decidedBy: '', decidedAt: '', comments: '', history: hist(approval, 'submitted', '') }, true, 'Submitted for approval')
  const approveQuote = (comments: string) => applyApproval({ ...approval, status: 'approved', decidedBy: me, decidedAt: now(), comments, history: hist(approval, 'approved', comments) }, true, 'Quote approved')
  const rejectQuote = (comments: string) => applyApproval({ ...approval, status: 'rejected', decidedBy: me, decidedAt: now(), comments, history: hist(approval, 'rejected', comments) }, false, 'Quote rejected')
  // Unlock reopens an approved/pending quote for editing and PERSISTS it: the
  // approval resets to none, so it stays unlocked for whoever opens it next (a
  // teammate) and won't lock again until it's re-submitted and re-approved. It
  // also drops out of Ready-to-Send until re-approved.
  const unlockQuote = () => {
    // Reopening also clears any pending reopen request so it drops off the manager's queue.
    const existingReq = (row?.data?.reopenRequest || null) as Record<string, unknown> | null
    const clearedReq = existingReq ? { ...existingReq, status: 'cleared', resolvedBy: me, resolvedAt: now(), resolution: 'unlocked' } : null
    if (reopenRequested) setReopenRequested(false)
    applyApproval(
      { ...approval, status: 'none', submittedBy: '', submittedAt: '', decidedBy: '', decidedAt: '', comments: '', history: hist(approval, 'reopened', '') },
      false,
      'Reopened for editing — needs re-approval',
      { editUnlocked: true, ...(clearedReq ? { reopenRequest: clearedReq } : {}) },
    )
  }
  // A teammate (non-approver) asks an approver to unlock this approved quote. It
  // stays approved/locked until an approver acts; the request surfaces on their
  // dashboard "Needs your attention".
  const requestReopenNow = async (reason: string) => {
    const at = now()
    const rr = { status: 'requested', requestedBy: me, requestedAt: at, reason: reason || '' }
    setReopenRequested(true)
    setRow((prev) => (prev ? { ...prev, data: { ...(prev.data || {}), reopenRequest: rr } as typeof prev.data } : prev))
    if (!WRITES_ENABLED) { showToast('Reopen requested (preview)', 'info'); return }
    if (!row) return
    try { await requestReopen(row.id, me, reason); showToast('Reopen requested — your manager will review', 'success') } catch (e) { showToast('Request failed: ' + errMsg(e), 'error', 6000) }
  }
  const submitWon = () => applyWon({ status: 'pending_won', submittedBy: me, submittedAt: now(), decidedBy: '', decidedAt: '', comments: '', history: hist(wonApproval, 'submitted_won', '') }, true, 'Submitted Closed-Won')
  const approveWon = (comments: string) => applyWon({ ...wonApproval, status: 'won_approved', decidedBy: me, decidedAt: now(), comments, history: hist(wonApproval, 'won_approved', comments) }, locked, 'Closed-Won approved')
  const rejectWon = (comments: string) => applyWon({ ...wonApproval, status: 'won_rejected', decidedBy: me, decidedAt: now(), comments, history: hist(wonApproval, 'won_rejected', comments) }, false, 'Closed-Won rejected')
  const isSalesforce = row?.source === 'salesforce'
  // An imported quote still in the legacy format (has summary.lines) that hasn't
  // been converted this session — editing is gated behind Convert-to-picker.
  const needsConversion = isSalesforce && !!(row?.data?.summary?.lines?.length) && !converted
  const applyConversion = (rows: ConvertedLine[]) => {
    setLineItems(rows.map((l) => ({ key: lineSeq.current++, code: l.code || '', label: l.label, desc: l.desc, price: l.price, added: false })))
    setConverted(true)
  }
  // Approved, but the approval came from an earlier revision (decided before this
  // row existed) — this revision still needs its own approval. Reflects preview
  // approval actions: once re-approved here, decidedAt is now → flag clears.
  const reapprovalNeeded = needsReapproval(approval.status, approval.decidedAt, row?.created_at)

  const data = (row?.data || {}) as Record<string, any>
  const qi = qiEdit // Quote Info display/edit share one live source.
  const ti = tiEdit // Test Item display/edit share one live source.
  const s = (v: unknown) => (v === undefined || v === null ? '' : String(v))

  const acct = s(qi.account) || row?.customer || ''
  const setTi = (patch: Record<string, any>) => setTiEdit((t) => ({ ...t, ...patch }))
  const setQi = (patch: Record<string, any>) => setQiEdit((q) => ({ ...q, ...patch }))
  const setSetupField = (patch: Record<string, any>) => setSetupEdit((s2) => ({ ...s2, ...patch }))
  const budgetUpd = (i: number, k: keyof BudgetRow, v: string) => setBudgetEdit((b) => ({ ...b, rows: b.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }))
  const budgetAdd = () => setBudgetEdit((b) => ({ ...b, on: true, rows: [...b.rows, { desc: '', qty: '1', unitCost: '0' }] }))
  const budgetRem = (i: number) => setBudgetEdit((b) => ({ ...b, rows: b.rows.filter((_, j) => j !== i) }))
  // One-way port from the calculator: append static budget rows (raw cost).
  const addBudgetRows = (rows: BudgetRow[]) => setBudgetEdit((b) => ({ ...b, on: true, rows: [...b.rows, ...rows] }))

  // PDF export — ports Classic's buildPDF (Letter, jsPDF). Line items come from
  // the unified list (drag order preserved); descriptions wrap in the PDF now.
  const [pdfBusy, setPdfBusy] = useState<'' | 'quote' | 'budget'>('')
  const exportPdf = async (budgetOnly: boolean) => {
    setPdfBusy(budgetOnly ? 'budget' : 'quote')
    try {
      // Lazy-load the PDF builder (jsPDF + assets) only on export, so the heavy
      // library stays out of the main bundle — mirrors Classic's on-demand load.
      const { buildQuotePdf } = await import('./pdf/buildQuotePdf')
      await buildQuotePdf({
        qi: qiEdit,
        ti: tiEdit,
        lines: lineItems.map((l) => ({ code: l.code, label: l.label, desc: l.desc, price: l.price })),
        budget: { on: budgetEdit.on, rows: budgetEdit.rows, markup: budgetEdit.markup },
        budgetOnly,
      })
    } catch (e) {
      console.error('PDF export failed', e)
    } finally {
      setPdfBusy('')
    }
  }

  // Spec Builder (quote-level launchers). "Classic" opens the tool blank; "from
  // CRR" needs the Workspace CRR workup (preview). The "from NUForce" source
  // lives in the calculator, where the live EMI/PQ/DCM selections are.
  const openClassicSpec = () => {
    setSpecMenuOpen(false)
    const q = encodeURIComponent(s(qi.opp) || row?.opportunity || '')
    window.open(q ? `/classic-spec-builder.html?quote=${q}` : '/classic-spec-builder.html', '_blank', 'noopener,noreferrer')
  }
  const openSpecFromCrr = async () => {
    setSpecMenuOpen(false)
    const opp = s(qi.opp) || row?.opportunity || ''
    if (!opp) { showToast('This quote has no number yet — save it first.', 'warn'); return }
    const workup = await fetchCrrWorkup(opp)
    if (!workup) { showToast(`No CRR workup found for ${opp}. Create one in Workspace first.`, 'error', 6000); return }
    const payload = buildSpecPayloadFromCrr(workup, opp)
    if (payload.sections.length === 0 && !window.confirm('The CRR workup has no enabled spec tables with numeric time. Open the Spec Builder anyway with a blank section?')) return
    try { localStorage.setItem('nuforce_spec_builder_payload', JSON.stringify(payload)) } catch (e) { console.warn('spec payload write failed', e) }
    const q = encodeURIComponent(opp)
    window.open(`/classic-spec-builder.html?quote=${q}&mode=from-quote`, '_blank', 'noopener,noreferrer')
  }

  // Line-item editing
  const addLineItems = (newLines: PickerLine[]) => setLineItems((cur) => [...cur, ...newLines.map((l) => ({ key: lineSeq.current++, code: l.code, label: l.label, desc: l.desc, price: l.price, added: true }))])
  const updateLine = (key: number, patch: Partial<LineItem>) => setLineItems((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key: number) => setLineItems((cur) => cur.filter((l) => l.key !== key))
  // Drag-to-sort: move the dragged line to the hovered line's position (live).
  const reorderTo = (fromKey: number, toKey: number) =>
    setLineItems((cur) => {
      const from = cur.findIndex((l) => l.key === fromKey)
      const to = cur.findIndex((l) => l.key === toKey)
      if (from < 0 || to < 0 || from === to) return cur
      const next = [...cur]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })

  // ── Save (write) ──────────────────────────────────────────────────────────
  // Assemble the DB model from the live edit state. Line items are picker-only;
  // originalData preserves any legacy blob keys V2 doesn't edit.
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
  const buildModel = (): QuoteSaveModel => ({
    id: row?.id,
    originalData: (row?.data || {}) as Record<string, any>,
    qi: qiEdit,
    ti: tiEdit,
    setup: setupEdit,
    budget: { on: budgetEdit.on, rows: budgetEdit.rows, markup: budgetEdit.markup },
    lines: lineItems.map((l) => ({ code: l.code, label: l.label, desc: l.desc, price: l.price })),
    approval,
    wonApproval,
    wonInfo,
    chatterEntries: (row?.data?.chatterEntries as unknown[]) || [],
    workspaceProjectId,
  })

  const persist = async (opts: { forceInsert?: boolean } = {}) => {
    if (!row || saveBusy) return
    setSaveBusy(true)
    try {
      let model = buildModel()
      // No-wipe guard: if the quote has stored line items but we're about to write
      // none (e.g. an import whose lines didn't resolve to the display), stop and
      // confirm rather than silently blanking them.
      const storedLineCount = (row.data?.pickerLines?.length || 0) + (row.data?.summary?.lines?.length || 0)
      if (model.lines.length === 0 && storedLineCount > 0) {
        const ok = window.confirm(`This quote has ${storedLineCount} stored line item(s), but none are showing to save — continuing would remove them. Save anyway?`)
        if (!ok) { showToast('Save cancelled — line items protected', 'warn'); return }
      }
      if (opts.forceInsert) {
        // New revision must earn its own approval — clear the inherited decision.
        const reset = resetApprovalForNewRevision(approval, me, row.revision || '(original)', s(qiEdit.rev) || '(original)', now())
        model = { ...model, approval: reset }
        setApproval(reset as ApprovalState)
        setLocked(false)
      }
      const serialized = serializeQuote(model)
      const newId = await saveQuote(serialized, opts)
      if (!newId) { showToast('Save failed — no row returned', 'error', 6000); return }
      showToast('Saved — ' + (s(qiEdit.opp) || 'quote'), 'success')
      setEditing(false)
      setRevDecision(null)
      const wasNew = !row.id // brand-new quote just got its first id
      if ((opts.forceInsert && newId !== row.id) || wasNew) {
        navigate(`/quote/${newId}`)
      } else {
        // Sync local row to the saved values so the next save compares fresh state.
        setRow((prev) => (prev ? {
          ...prev,
          id: newId,
          opportunity: serialized.row.opportunity ?? prev.opportunity,
          customer: serialized.row.customer ?? prev.customer,
          revision: serialized.row.revision ?? null,
          stage: serialized.row.stage ?? prev.stage,
          total: serialized.row.total ?? prev.total,
          approval_status: serialized.row.approval_status,
          won_approval_status: serialized.row.won_approval_status,
          data: serialized.row.data as typeof prev.data,
        } : prev))
      }
    } catch (e) {
      showToast('Save failed: ' + errMsg(e), 'error', 7000)
    } finally {
      setSaveBusy(false)
    }
  }

  const onSave = () => {
    if (!row) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    // Date barrier (ported from Classic): moving a quote TO Closed Won this session
    // requires the Won Date before it can save. Already-Closed-Won quotes loaded
    // from the DB skip this — no friction on routine edits.
    if (s(qiEdit.stage) === 'Closed Won' && row.stage !== 'Closed Won' && !wonInfo.wonDate.trim()) {
      showToast('Confirm the Won Date first.', 'warn', 4000)
      return
    }
    // A brand-new quote (no row id yet) just inserts — no rev/opp-change prompts.
    if (row.id) {
      // Revision-letter change → ask new-revision vs overwrite (handled in the modal).
      if (isRevisionChange(row.revision, qiEdit.rev)) {
        setRevDecision({ oldRev: row.revision || '', newRev: s(qiEdit.rev) })
        return
      }
      // Opportunity-number change (not a rev bump) → confirm before saving.
      const oppInfo = oppChangeInfo(row.opportunity, qiEdit.opp)
      if (oppInfo.changed) {
        const ok = window.confirm(`You're changing the quote number:\n\n  ${row.opportunity}  →  ${s(qiEdit.opp)}\n\nSave with the new number?`)
        if (!ok) { showToast('Save cancelled', 'warn'); return }
      }
    }
    persist()
  }

  // ── Clone ───────────────────────────────────────────────────────────────────
  // Insert a fresh quote copying this one's content under a new quote number.
  // Ported from Classic's doClone: the clone always starts at Proposal/Price Quote
  // with won details, approvals, chatter, and any Workspace link cleared — so a
  // cloned Closed-Won quote is a brand-new proposal, not another won job.
  const doClone = async () => {
    if (!row || cloneBusy) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    const newOpp = cloneOpp.trim()
    if (!newOpp) { showToast('Enter a new quote number for the clone.', 'error'); return }
    setCloneBusy(true)
    try {
      const cloneModel: QuoteSaveModel = {
        ...buildModel(),
        id: undefined,
        originalData: {},
        qi: { ...qiEdit, opp: newOpp, rfq: '', rev: '', revDate: '', date: new Date().toLocaleDateString('en-US'), stage: 'Proposal/Price Quote' },
        approval: { status: 'none', history: [] },
        wonApproval: { status: 'none', history: [] },
        wonInfo: { wonDate: '', jobNum: '', poNum: '' },
        chatterEntries: [],
        workspaceProjectId: null,
      }
      const newId = await saveQuote(serializeQuote(cloneModel), { forceInsert: true })
      if (!newId) { showToast('Clone failed — no row returned', 'error', 6000); return }
      showToast(`Cloned to ${newOpp}`, 'success')
      setCloneOpen(false); setCloneOpp('')
      navigate(`/quote/${newId}`)
    } catch (e) {
      showToast('Clone failed: ' + errMsg(e), 'error', 7000)
    } finally {
      setCloneBusy(false)
    }
  }

  // ── Workspace project (Closed-Won) ──────────────────────────────────────────
  // Save the quote quietly (so wonInfo + line items are persisted server-side),
  // then run the RPC. Returns the saved id, or null if the save failed.
  const saveQuietly = async (): Promise<string | null> => {
    const serialized = serializeQuote(buildModel())
    const newId = await saveQuote(serialized, {})
    if (newId) setRow((prev) => (prev ? { ...prev, id: newId, stage: serialized.row.stage ?? prev.stage, data: serialized.row.data as typeof prev.data } : prev))
    return newId
  }

  const buildWsSource = (quoteId: string): ProjectSourceInput => ({
    quoteId,
    qi: qiEdit,
    ti: tiEdit,
    wonInfo,
    lines: lineItems.map((l) => ({ code: l.code, label: l.label, desc: l.desc, price: l.price })),
    budget: { rows: budgetEdit.rows },
    specsText: s(tiEdit.tiSpecs),
    notesText: s(tiEdit.tiNotes),
  })

  const notifyWon = () =>
    notifyClosedWon({
      opportunity: s(qiEdit.opp) || '',
      customer: s(qiEdit.account) || '',
      total: money(lineItems.reduce((a, l) => a + (l.price || 0), 0)),
      wonDate: wonInfo.wonDate || '',
      closedByName: prettifyEmail(me),
      linkUrl: 'https://nuforce.nulabs.com/#dashboard',
    })

  const handleCreateProject = async () => {
    if (!row || wsBusy) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    const jobNum = wonInfo.jobNum.trim()
    if (!jobNum) { showToast('Enter a Job # before creating a project.', 'error', 4000); return }
    setWsBusy(true)
    try {
      const savedId = await saveQuietly()
      if (!savedId) { showToast('Couldn’t save the quote before creating the project.', 'error', 6000); return }
      const lookup = await lookupProjectByJobNumber(jobNum)
      if (lookup?.found) { showToast(`Job # "${jobNum}" already exists on "${lookup.project_name}". Use Add to existing, or change the Job #.`, 'error', 8000); return }
      const result = await createProjectFromNuforce(buildWsSource(savedId))
      if (!result?.project_id) throw new Error('Project creation returned no project_id')
      await setWorkspaceLink(savedId, result.project_id).catch(() => {})
      setWorkspaceProjectId(result.project_id)
      showToast(`Project "${jobNum}" created in Workspace (${result.task_count || 0} tasks, ${result.expense_count || 0} expenses)`, 'success', 5000)
      notifyWon()
    } catch (e) {
      showToast(describeWorkspaceError(e, { accountName: s(qiEdit.account), actionLabel: 'create the project' }), 'error', 9000)
    } finally {
      setWsBusy(false)
    }
  }

  const handleAddToExisting = async () => {
    if (!row || wsBusy) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    const jobNum = wonInfo.jobNum.trim()
    if (!jobNum) { showToast('Enter the existing project’s Job # first.', 'error', 4000); return }
    setWsBusy(true)
    try {
      const lookup = await lookupProjectByJobNumber(jobNum)
      if (!lookup?.found || !lookup.project_id) { showToast(`No Workspace project with Job # "${jobNum}". Check the Job # or use Create project.`, 'error', 7000); return }
      const taskCount = lineItems.filter((l) => l.label || l.price).length
      const ok = window.confirm(`Add this quote to existing project "${lookup.project_name}"?\n\nThis appends ${taskCount} task(s) and this quote's budget expenses to that project.`)
      if (!ok) { showToast('Add to existing cancelled', 'warn'); return }
      const savedId = await saveQuietly()
      if (!savedId) { showToast('Couldn’t save the quote before adding to the project.', 'error', 6000); return }
      const result = await appendToProject(buildWsSource(savedId))
      if (!result?.project_id) throw new Error('Append returned no project_id')
      await setWorkspaceLink(savedId, result.project_id).catch(() => {})
      setWorkspaceProjectId(result.project_id)
      showToast(`Added to "${lookup.project_name}" (${result.tasks_added || 0} tasks, ${result.expenses_added || 0} expenses)`, 'success', 5000)
      notifyWon()
    } catch (e) {
      showToast(describeWorkspaceError(e, { accountName: s(qiEdit.account), actionLabel: 'add to the existing project' }), 'error', 9000)
    } finally {
      setWsBusy(false)
    }
  }

  // Open the linked project. When a Job # is present, re-resolve by Job # (self-heals
  // a stale cached id), falling back to the cached id only if the lookup is unreachable.
  const handleOpenInWorkspace = async () => {
    const jobNum = wonInfo.jobNum.trim()
    if (!jobNum) {
      if (workspaceProjectId) { window.open(workspaceProjectUrl(workspaceProjectId), '_blank', 'noopener,noreferrer'); return }
      showToast('No Job # on this quote to open in Workspace.', 'error', 4000)
      return
    }
    setWsBusy(true)
    try {
      let lookup
      try { lookup = await lookupProjectByJobNumber(jobNum) } catch {
        if (workspaceProjectId) { window.open(workspaceProjectUrl(workspaceProjectId), '_blank', 'noopener,noreferrer'); return }
        showToast('Couldn’t reach Workspace to open the project.', 'error', 6000); return
      }
      if (!lookup?.found || !lookup.project_id) { showToast(`No Workspace project for Job # "${jobNum}". It may have been deleted or not created yet — use Create project or Add to existing.`, 'error', 8000); return }
      if (lookup.project_id !== workspaceProjectId) {
        setWorkspaceProjectId(lookup.project_id)
        if (row) setWorkspaceLink(row.id, lookup.project_id).catch(() => {})
      }
      window.open(workspaceProjectUrl(lookup.project_id), '_blank', 'noopener,noreferrer')
    } finally {
      setWsBusy(false)
    }
  }

  const handleUnlinkWorkspace = async () => {
    if (!row || wsBusy) return
    if (!window.confirm('Unlink this quote from its Workspace project? This does NOT delete the Workspace project — it only clears the link here so you can re-create or re-link.')) return
    setWsBusy(true)
    try {
      await setWorkspaceLink(row.id, null)
      setWorkspaceProjectId(null)
      showToast('Workspace link cleared.', 'info', 3500)
    } catch (e) {
      showToast('Couldn’t clear the link: ' + errMsg(e), 'error', 6000)
    } finally {
      setWsBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'var(--sp-6) var(--sp-5) 60px' }}>
      <Link to="/" style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>← Back to dashboard</Link>

      {state === 'loading' && <div style={{ color: 'var(--muted)', marginTop: 'var(--sp-5)' }}>Loading quote…</div>}
      {state === 'notfound' && <div style={{ color: 'var(--muted)', marginTop: 'var(--sp-5)' }}>No quote found for this id.</div>}
      {state === 'error' && <div style={{ color: 'var(--accent)', marginTop: 'var(--sp-5)' }}>Couldn’t load quote: {err}</div>}

      {state === 'ok' && row && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-3)', margin: 'var(--sp-3) 0 var(--sp-5)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              {editing ? (
                <div>
                  <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 3 }}>Quote number</div>
                  <input value={s(qi.opp)} onChange={(e) => setQi({ opp: e.target.value })} style={{ ...regInput, fontSize: 'var(--fs-xl)', fontWeight: 800, maxWidth: 340 }} />
                </div>
              ) : (
                <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, letterSpacing: '-.02em' }}>{s(qi.opp) || row.opportunity}</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
              <Button variant="ghost" small onClick={() => setRevOpen(true)}>Revisions</Button>
              <Button variant="secondary" small disabled={pdfBusy !== ''} onClick={() => exportPdf(false)}>{pdfBusy === 'quote' ? 'Generating…' : 'Quote PDF'}</Button>
              {budgetEdit.rows.length > 0 && <Button variant="secondary" small disabled={pdfBusy !== ''} onClick={() => exportPdf(true)}>{pdfBusy === 'budget' ? 'Generating…' : 'Budget PDF'}</Button>}
              <div style={{ position: 'relative' }}>
                <Button variant="secondary" small onClick={() => setSpecMenuOpen((v) => !v)}>Spec Builder</Button>
                {specMenuOpen && (
                  <>
                    <div onClick={() => setSpecMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 230, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', zIndex: 31, overflow: 'hidden' }}>
                      <button onClick={openClassicSpec} style={menuItemStyle}>Classic Spec Builder</button>
                      <button onClick={openSpecFromCrr} style={{ ...menuItemStyle, borderTop: '1px solid var(--border)' }}>Spec Builder from CRR</button>
                    </div>
                  </>
                )}
              </div>
              {WRITES_ENABLED && !locked && <Button variant="primary" small disabled={saveBusy} onClick={onSave}>{saveBusy ? 'Saving…' : 'Save'}</Button>}
              {row.id && <Button variant="secondary" small onClick={() => setSendOpen(true)}>Send</Button>}
              {row.id && WRITES_ENABLED && <Button variant="secondary" small onClick={() => { setCloneOpp(''); setCloneOpen(true) }} title="Create a copy of this quote under a new number">Clone</Button>}
              {editing || !locked ? (
                <Button variant="secondary" small onClick={() => setEditing((e) => !e)}>{editing ? 'Done editing' : 'Edit'}</Button>
              ) : (
                <Button variant="secondary" small disabled title={approval.status === 'pending' ? 'Locked while pending approval' : approval.status === 'approved' ? (isSalesforce ? 'Imported (approved) — an approver can reopen to edit' : 'Approved — an approver can reopen to edit') : 'Locked'}>Locked</Button>
              )}
            </div>
          </div>

          {revOpen && <RevisionHistory opportunity={s(qi.opp) || row.opportunity || ''} currentId={row.id} onClose={() => setRevOpen(false)} />}

          {cloneOpen && (
            <Modal title="Clone quote" onClose={() => !cloneBusy && setCloneOpen(false)} width={430}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', lineHeight: 1.6, marginBottom: 'var(--sp-3)' }}>
                Creates a new quote copying this one&rsquo;s line items, test info, and budget. The clone starts at <b>Proposal/Price Quote</b> with won details, approvals, chatter, and any Workspace link cleared.
              </div>
              <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>New quote number</div>
              <input
                value={cloneOpp}
                onChange={(e) => setCloneOpp(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doClone() }}
                placeholder="e.g. 26-457"
                autoFocus
                style={{ width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-base)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
                <Button variant="secondary" small onClick={() => setCloneOpen(false)} disabled={cloneBusy}>Cancel</Button>
                <Button variant="primary" small onClick={doClone} disabled={cloneBusy || !cloneOpp.trim()}>{cloneBusy ? 'Cloning…' : 'Clone'}</Button>
              </div>
            </Modal>
          )}

          {revDecision && (
            <Modal title="Revision changed" onClose={() => !saveBusy && setRevDecision(null)} width={460}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', lineHeight: 1.6, marginBottom: 'var(--sp-4)' }}>
                The revision letter changed from <b>{revDecision.oldRev || '(original)'}</b> to <b>{revDecision.newRev || '(original)'}</b>. Save as a new revision (keeps the current one in history), or overwrite it?
                <div style={{ color: 'var(--muted)', marginTop: 'var(--sp-2)' }}>A new revision starts unapproved — it needs its own approval before it's ready to send.</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                <Button variant="ghost" small disabled={saveBusy} onClick={() => setRevDecision(null)}>Cancel</Button>
                <Button variant="secondary" small disabled={saveBusy} onClick={() => persist()}>{saveBusy ? 'Saving…' : 'Overwrite'}</Button>
                <Button variant="primary" small disabled={saveBusy} onClick={() => persist({ forceInsert: true })}>{saveBusy ? 'Saving…' : 'Save as new revision'}</Button>
              </div>
            </Modal>
          )}

          {row.id ? (
            <>
              <ApprovalBar
                approval={approval}
                wonApproval={wonApproval}
                isApprover={isApprover}
                isSalesforce={isSalesforce}
                needsReapproval={reapprovalNeeded}
                locked={locked}
                stage={s(qi.stage) || row.stage || ''}
                reopenRequested={reopenRequested}
                onSubmit={submitApproval}
                onApprove={approveQuote}
                onReject={rejectQuote}
                onUnlock={unlockQuote}
                onRequestReopen={requestReopenNow}
                onSubmitWon={submitWon}
                onWonApprove={approveWon}
                onWonReject={rejectWon}
              />

              <QuoteActions key={`qa-${sendNonce}`} quoteId={row.id} opportunity={s(qi.opp) || row.opportunity} customer={acct} stage={s(qi.stage) || row.stage || ''} approvalStatus={approval.status} chatter={(row.data?.chatterEntries as ChatterEntry[]) || []} me={me} onOpenSend={() => setSendOpen(true)} />

              <SentFiles key={`sf-${sendNonce}`} quoteId={row.id} opportunity={s(qi.opp) || row.opportunity || ''} />
            </>
          ) : (
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', padding: 'var(--sp-3) 0' }}>Save this new quote to unlock approvals, sending, and history.</div>
          )}

          {sendOpen && (
            <SendComposer
              mode="quote"
              quoteId={row.id}
              opportunity={s(qi.opp) || row.opportunity || ''}
              revision={row.revision || null}
              contactName={s(qi.contact) || (Array.isArray(qi.relatedContacts) && qi.relatedContacts[0]?.name) || ''}
              contactEmail={s(qi.email) || (Array.isArray(qi.relatedContacts) && qi.relatedContacts[0]?.email) || ''}
              ccEmails={Array.isArray(qi.relatedContacts) ? qi.relatedContacts.map((rc: any) => s(rc?.email)).filter(Boolean) : []}
              testItem={s(ti.item)}
              pdfInput={{ qi: qiEdit, ti: tiEdit, lines: lineItems.map((l) => ({ code: l.code, label: l.label, desc: l.desc, price: l.price })), budget: { on: budgetEdit.on, rows: budgetEdit.rows, markup: budgetEdit.markup } }}
              onClose={() => setSendOpen(false)}
              onSent={() => setSendNonce((n) => n + 1)}
            />
          )}

          {(wonApproval.status === 'won_approved' || (s(qi.stage) || row.stage) === 'Closed Won') && (
            <ClosedWonDetails
              wonInfo={wonInfo}
              onChange={setWonInfo}
              projectId={workspaceProjectId}
              loadedJobNum={loadedJobNum}
              isApprover={isApprover}
              busy={wsBusy}
              onCreateProject={handleCreateProject}
              onAddToExisting={handleAddToExisting}
              onOpenInWorkspace={handleOpenInWorkspace}
              onUnlink={handleUnlinkWorkspace}
            />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <Card>
              <CardLabel>Customer</CardLabel>
              {/* Read-only — mirrors the Account field in Quote Info (set/linked there). */}
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>{s(qi.account) || row.customer || '—'}</div>
              {editing && <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 4 }}>Set the account in Quote info below.</div>}
            </Card>
            <Card>
              <CardLabel>Stage</CardLabel>
              {editing ? (
                <select value={s(qi.stage)} onChange={(e) => setQi({ stage: e.target.value })} style={regInput}>
                  {STAGE_OPTS.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>{s(qi.stage) || row.stage || '—'}</div>
              )}
            </Card>
            <Card><CardLabel>Total</CardLabel><div style={{ fontSize: 'var(--fs-md)', fontWeight: 700 }}>{money(Number(row.total) || 0)}</div></Card>
          </div>

          {editing && !WRITES_ENABLED && (
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)', marginBottom: 'var(--sp-4)' }}>
              Editing is a live preview — writes are off, so Save won’t persist yet.
            </div>
          )}

          <QuoteInfoCard editing={editing} qi={qi} setQi={setQi} />

          <RelatedContacts
            contacts={(Array.isArray(qi.relatedContacts) ? qi.relatedContacts : []) as RelatedContact[]}
            editing={editing}
            onChange={(next) => setQi({ relatedContacts: next })}
          />

          <TestItemCard editing={editing} ti={ti} setTi={setTi} acct={acct} />

          <SpecsNotes editing={editing} ti={ti} setTi={setTi} savedNotes={cleanSpecText(s(data.notes), isSalesforce)} />

          <LineItemsCard
            lineItems={lineItems}
            editing={editing}
            lineEditing={lineEditing}
            locked={locked}
            onToggleLineEditing={() => setLineEditing((e) => !e)}
            onUpdateLine={updateLine}
            onRemoveLine={removeLine}
            onReorder={reorderTo}
            onOpenCalc={() => setCalcOpen(true)}
            onOpenPicker={() => setPickerOpen(true)}
            needsConversion={needsConversion}
            onConvert={() => setConvertOpen(true)}
          />

          <BudgetCard
            editing={editing}
            budget={budgetEdit}
            onMarkupChange={(v) => setBudgetEdit((b) => ({ ...b, markup: v }))}
            onUpd={budgetUpd}
            onAdd={budgetAdd}
            onRem={budgetRem}
          />
          {calcOpen && (
            <PricingCalculator
              onSend={(newLines) => { setPickerSeed(newLines); setPickerCustomSeed(null); setCalcOpen(false); setPickerOpen(true) }}
              onSendCustom={(lines) => { setPickerCustomSeed(lines); setPickerSeed(null); setCalcOpen(false); setPickerOpen(true) }}
              onAddBudget={addBudgetRows}
              onClose={() => setCalcOpen(false)}
              ti={ti}
              qi={qi}
              setup={setupEdit}
              onSetupChange={setSetupField}
            />
          )}
          {convertOpen && (
            <ConvertToPicker
              lines={lineItems.map((l) => ({ key: l.key, code: l.code, label: l.label, desc: l.desc, price: l.price }))}
              onConvert={applyConversion}
              onClose={() => setConvertOpen(false)}
            />
          )}
          {pickerOpen && (
            <ProductPicker
              onAdd={addLineItems}
              onClose={() => { setPickerOpen(false); setPickerSeed(null); setPickerCustomSeed(null) }}
              initialSelected={pickerSeed || undefined}
              initialCustom={pickerCustomSeed || undefined}
              setup={setupEdit}
              ti={ti}
              vibs={data.vibs}
              hfvs={data.hfvs}
            />
          )}
        </>
      )}
    </div>
  )
}

import { restFetch } from './restFetch'
import { lineItemsFromData } from '../data/quoteModel'
import type { ProjectSourceInput } from './workspace'

// Contracting tab data + writes. All writes are TARGETED PATCHes that only touch
// the contracting fields (stage, won columns, data.wonInfo/wonApproval) — the line
// items, qi, ti, and budget on the quote are never re-serialized, so nothing on
// the quote can be clobbered from here. The Workspace project payload is assembled
// from the loaded data blob and handed to the shared workspace.ts RPCs.

export interface ContractingWonInfo { wonDate: string; jobNum: string; poNum: string }

export interface ContractingQuote {
  id: string
  opportunity: string | null
  customer: string | null
  stage: string | null
  total: number | null
  revision: string | null
  wonApprovalStatus: string | null // none | pending_won | won_approved | won_rejected
  workspaceProjectId: string | null
  clientId: string // data.qi.client_id — empty means the account isn't linked
  // A Salesforce import whose legacy lines haven't been converted to picker lines.
  // Must be converted (on the quote page) before close-won so the project gets tasks.
  needsConversion: boolean
  wonInfo: ContractingWonInfo
  // Pieces used to build the Workspace project payload (from the saved blob).
  qi: Record<string, unknown>
  ti: Record<string, unknown>
  lines: { code?: string | null; label: string; desc?: string; price: number }[]
  budgetRows: unknown[]
  specsText: string
  notesText: string
}

const enc = (v: string) => encodeURIComponent(v)
const s = (v: unknown) => (v == null ? '' : String(v).trim())

/** "M/D/YYYY" (or anything Date can parse) → "YYYY-MM-DD" for the won_date column. */
function toYMD(d?: string): string | null {
  if (!d) return null
  const p = new Date(d)
  return isNaN(p.getTime()) ? null : p.toISOString().slice(0, 10)
}

/** Load one quote's full contracting view (won details + Workspace payload pieces). */
export async function loadContractingQuote(id: string): Promise<ContractingQuote | null> {
  const rows = await restFetch<Array<Record<string, any>>>(
    'GET',
    `quotes?select=id,opportunity,customer,stage,total,revision,won_approval_status,job_number,po_number,won_date,workspace_project_id,source,data&id=eq.${enc(id)}&limit=1`,
  )
  const r = rows?.[0]
  if (!r) return null
  const d = (r.data || {}) as Record<string, any>
  const qi = (d.qi || {}) as Record<string, any>
  const ti = (d.ti || {}) as Record<string, any>
  const b = (d.budget || {}) as Record<string, any>
  const won = (d.wonInfo || {}) as Partial<ContractingWonInfo>
  const source = s(d.source) || s(r.source)
  const hasLegacy = Array.isArray(d.summary?.lines) && d.summary.lines.length > 0
  const hasPicker = Array.isArray(d.pickerLines) && d.pickerLines.length > 0
  return {
    id: r.id,
    opportunity: r.opportunity ?? null,
    customer: r.customer ?? null,
    stage: r.stage ?? null,
    total: r.total ?? null,
    revision: r.revision ?? null,
    wonApprovalStatus: r.won_approval_status ?? null,
    workspaceProjectId: (d.workspace_project_id as string) ?? r.workspace_project_id ?? null,
    clientId: s(qi.client_id),
    needsConversion: source === 'salesforce' && hasLegacy && !hasPicker,
    wonInfo: {
      wonDate: won.wonDate || r.won_date || '',
      jobNum: won.jobNum || r.job_number || '',
      poNum: won.poNum || r.po_number || '',
    },
    qi,
    ti,
    lines: lineItemsFromData(d).map((l) => ({ code: l.code, label: l.label, desc: l.desc, price: l.price })),
    budgetRows: Array.isArray(b.rows) ? b.rows : [],
    specsText: s(ti.tiSpecs),
    notesText: s(ti.tiNotes),
  }
}

/** Assemble the Workspace project payload from a loaded contracting quote + live won info. */
export function buildProjectSource(q: ContractingQuote, wonInfo: ContractingWonInfo): ProjectSourceInput {
  return {
    quoteId: q.id,
    qi: q.qi as Record<string, any>,
    ti: q.ti as Record<string, any>,
    wonInfo,
    lines: q.lines,
    budget: { rows: q.budgetRows as { desc?: string; qty?: string; unitCost?: string }[] },
    specsText: q.specsText,
    notesText: q.notesText,
  }
}

/** Persist won details (stage → Closed Won + won columns + data.wonInfo). Targeted —
 *  leaves line items and everything else on the quote untouched. Does NOT change the
 *  won-approval status; use submitForWonApproval for that. */
export async function saveWonDetails(id: string, wonInfo: ContractingWonInfo): Promise<void> {
  const rows = await restFetch<Array<{ data?: Record<string, any> }>>('GET', `quotes?select=data&id=eq.${enc(id)}&limit=1`)
  const data = (rows?.[0]?.data || {}) as Record<string, any>
  const nextData = {
    ...data,
    qi: { ...(data.qi || {}), stage: 'Closed Won' },
    wonInfo: { wonDate: wonInfo.wonDate, jobNum: wonInfo.jobNum, poNum: wonInfo.poNum },
  }
  await restFetch('PATCH', `quotes?id=eq.${enc(id)}`, {
    body: {
      stage: 'Closed Won',
      won_date: toYMD(wonInfo.wonDate),
      job_number: wonInfo.jobNum || null,
      po_number: wonInfo.poNum || null,
      data: nextData,
      updated_at: new Date().toISOString(),
    },
  })
}

/** Submit the Closed-Won for approval — the SAME rule the quote page uses: sets
 *  won_approval_status = pending_won and logs it in data.wonApproval so it lands in
 *  the "Won approvals pending" queue for an approver to decide. */
export async function submitForWonApproval(id: string, by: string): Promise<void> {
  const rows = await restFetch<Array<{ data?: Record<string, any> }>>('GET', `quotes?select=data&id=eq.${enc(id)}&limit=1`)
  const data = (rows?.[0]?.data || {}) as Record<string, any>
  const now = new Date().toISOString()
  const prev = (data.wonApproval || {}) as Record<string, any>
  const wonApproval = {
    ...prev,
    status: 'pending_won',
    submittedBy: by,
    submittedAt: now,
    decidedBy: '',
    decidedAt: '',
    comments: '',
    history: [...((prev.history as unknown[]) || []), { event: 'submitted_won', by, at: now, comments: '' }],
  }
  await restFetch('PATCH', `quotes?id=eq.${enc(id)}`, {
    body: { won_approval_status: 'pending_won', data: { ...data, wonApproval }, updated_at: now },
  })
}

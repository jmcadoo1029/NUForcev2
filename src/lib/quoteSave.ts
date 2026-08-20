import { restFetch } from './restFetch'
import { sf } from './format'
import type { ApprovalBlock } from './quoteGuards'

// Central quote writer, ported from Classic's saveQuoteToSupabase but simplified
// for V2's picker-only line-item model. serializeQuote() turns the in-app quote
// (qi/ti/setup/budget + the unified line list) into the exact DB row shape — the
// top-level columns the dashboards/Workspace read, the `line_items` jsonb, and the
// full `data` blob — and saveQuote() writes it (POST insert / PATCH update).
//
// READY TO WIRE: this issues real writes, so it stays uncalled from the UI until
// the write path is switched on. Nothing imports it yet.

export interface SaveLine {
  code?: string | null
  label: string
  desc?: string
  price: number
}

export interface QuoteSaveModel {
  id?: string // present → update; absent (or forceInsert) → insert
  // The originally-loaded `data` blob, so re-saving a legacy quote preserves keys
  // V2 doesn't edit (old Advanced-Mode sections, etc.). Line sources are replaced.
  originalData?: Record<string, any>
  qi: Record<string, any>
  ti: Record<string, any>
  setup: Record<string, any>
  budget: { on: boolean; rows: { desc?: string; qty?: string; unitCost?: string }[]; markup: string; notes?: string }
  lines: SaveLine[] // the unified, picker-only line items
  approval: ApprovalBlock
  wonApproval: ApprovalBlock
  wonInfo?: { wonDate?: string; jobNum?: string; poNum?: string }
  chatterEntries?: unknown[]
  workspaceProjectId?: string | null
}

export interface SerializedQuote {
  row: Record<string, any>
  total: number
}

const str = (v: unknown): string => (v == null ? '' : String(v).trim())

/** "YYYY-MM-DD" or null — won_date is stored as text (see the schema note). */
function toYMD(d?: string): string | null {
  if (!d) return null
  const p = new Date(d)
  return isNaN(p.getTime()) ? null : p.toISOString().slice(0, 10)
}

/**
 * Turn the in-app quote into the DB row. Line items become picker-only: they go
 * into the blob as `pickerLines` (with `price`, what V2 analytics reads) and into
 * the top-level `line_items` jsonb (with `val`, the shape Workspace/legacy read),
 * and the legacy line sources are dropped so the total stays consistent.
 */
export function serializeQuote(model: QuoteSaveModel): SerializedQuote {
  const { qi, ti, setup, budget, lines, approval, wonApproval, wonInfo, chatterEntries } = model
  const total = lines.reduce((a, l) => a + sf(l.price), 0)

  const pickerLines = lines.map((l) => ({ code: str(l.code), label: str(l.label) || 'Line Item', desc: str(l.desc), price: sf(l.price) }))
  const lineItems = lines.map((l) => ({ code: str(l.code), label: str(l.label) || 'Line Item', desc: str(l.desc), val: sf(l.price) }))

  // Rebuild the blob: keep legacy keys, overlay edited sections, and clear the
  // old line sources (picker-only from now on).
  const blob: Record<string, any> = { ...(model.originalData || {}) }
  blob.qi = qi
  blob.ti = ti
  blob.setup = setup
  blob.budget = budget
  blob.pickerLines = pickerLines
  blob.approval = approval
  blob.wonApproval = wonApproval
  if (wonInfo) blob.wonInfo = wonInfo
  if (chatterEntries) blob.chatterEntries = chatterEntries
  if (model.workspaceProjectId !== undefined) blob.workspace_project_id = model.workspaceProjectId
  // Drop legacy Advanced-Mode line sources so the picker list is the only truth.
  delete blob.summary
  delete blob.lineOverrides
  delete blob.custom
  delete blob.lineOrder
  delete blob.unifiedOrder

  const searchText = [
    qi.opp, qi.account, qi.rfq, qi.rev, qi.contact, qi.email, qi.prepby, qi.stage, qi.relatedOpps,
    wonInfo?.jobNum, wonInfo?.poNum, ti.item, ti.model,
    ...lines.map((l) => l.label), ...lines.map((l) => l.code),
  ].map(str).filter(Boolean).join(' ')

  const row: Record<string, any> = {
    opportunity: str(qi.opp) || null,
    customer: str(qi.account) || null,
    rfq: str(qi.rfq) || null,
    revision: str(qi.rev) || null,
    stage: str(qi.stage) || null,
    total: total || null,
    job_number: str(wonInfo?.jobNum) || null,
    po_number: str(wonInfo?.poNum) || null,
    won_date: toYMD(wonInfo?.wonDate),
    approval_status: approval?.status || 'none',
    won_approval_status: wonApproval?.status || 'none',
    submitted_by: str(approval?.submittedBy) || null,
    approved_by: str(approval?.decidedBy) || null,
    specifications: str(ti?.tiSpecs) || null,
    notes: str(ti?.tiNotes) || null,
    line_items: lineItems,
    budget_items: budget?.rows || null,
    budget_markup: budget?.markup ? sf(budget.markup) : null,
    budget_notes: str(budget?.notes) || null,
    workspace_project_id: model.workspaceProjectId || null,
    data: blob,
    search_text: searchText,
    updated_at: new Date().toISOString(),
  }
  if (model.id) row.id = model.id
  return { row, total }
}

export interface SaveOpts { forceInsert?: boolean }

/**
 * Write the serialized row. Insert (POST) when there's no id or forceInsert is set
 * (a new revision) — id and updated_at are omitted so the DB stamps created_at/id
 * fresh, which is what keeps the inherited-approval detection correct. Otherwise
 * update (PATCH) by id. Returns the row id, or null on an empty representation.
 */
export async function saveQuote(serialized: SerializedQuote, opts: SaveOpts = {}): Promise<string | null> {
  const { row } = serialized
  const insert = opts.forceInsert || !row.id
  if (insert) {
    // Let the DB own id + created_at (a new revision must get a fresh created_at).
    const { id: _omitId, created_at: _omitCreated, ...body } = row as Record<string, any>
    void _omitId; void _omitCreated
    const res = await restFetch<Array<{ id: string }>>('POST', 'quotes', { body, returnRepresentation: true })
    return res?.[0]?.id ?? null
  }
  const { id, ...body } = row as Record<string, any>
  const res = await restFetch<Array<{ id: string }>>('PATCH', `quotes?id=eq.${encodeURIComponent(id)}`, { body, returnRepresentation: true })
  return res?.[0]?.id ?? (id as string)
}

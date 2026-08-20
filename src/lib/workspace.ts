import { REST_BASE, FN_BASE, REST_APIKEY, REST_TIMEOUT_MS } from './config'
import { getAccessToken } from './auth'
import { restFetch } from './restFetch'

// NUWorkspace integration: turn a Closed-Won quote into a Workspace project (or
// append it to an existing one), and keep the quote↔project link in sync. Ported
// from Classic; the RPC contract (create_project_from_nuforce /
// append_to_project_from_nuforce / lookup_project_by_job_number) is owned by
// Workspace (Russ) and unchanged. Callers gate on WRITES_ENABLED.

const WORKSPACE_BASE = 'https://workspace.nulabs.com'

// ── RPC + edge-function callers (session-token bypass, like restFetch) ────────

/** POST /rest/v1/rpc/<fn> with args; returns the function's return value. Throws on error. */
export async function rpcCall<T = any>(fnName: string, args: Record<string, unknown> = {}): Promise<T> {
  const token = getAccessToken()
  if (!token) throw new Error('No active session.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REST_TIMEOUT_MS)
  try {
    const res = await fetch(`${REST_BASE}/rpc/${fnName}`, {
      method: 'POST',
      headers: { apikey: REST_APIKEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: controller.signal,
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '(no body)')
      throw new Error(`RPC ${fnName} failed: ${res.status} ${errBody.slice(0, 300)}`)
    }
    const text = await res.text()
    if (!text) return null as T
    try { return JSON.parse(text) as T } catch { return text as unknown as T }
  } finally {
    clearTimeout(timer)
  }
}

/** Invoke an edge function (used for the closed-won notification). */
export async function invokeFunction<T = any>(fnName: string, body: Record<string, unknown>): Promise<T | null> {
  const token = getAccessToken()
  if (!token) throw new Error('No active session.')
  const res = await fetch(`${FN_BASE}/${fnName}`, {
    method: 'POST',
    headers: { apikey: REST_APIKEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`FN ${fnName} failed: ${res.status} ${text.slice(0, 300)}`)
  }
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? ((await res.json()) as T) : null
}

// ── Payload builders (ported; V2 line items are already unified) ──────────────

const sf = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n }
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

/** Combine a manual + auto spec/notes block, dropping auto lines already present. */
export function combineSpecs(manual?: string, auto?: string): string {
  const m = (manual || '').trim()
  const a = (auto || '').trim()
  if (!m) return a
  if (!a) return m
  const newLines = a.split('\n\n').filter((line) => !m.includes(line.trim()))
  return newLines.length ? m + '\n\n' + newLines.join('\n\n') : m
}

/** Labeled test-article description from the ti object (only non-empty fields). */
export function buildTestArticleDescription(ti: Record<string, any> | undefined): string {
  if (!ti) return ''
  const lines: string[] = []
  const push = (label: string, value: unknown) => {
    const s = str(value)
    if (s === '' || s === '0') return
    lines.push(`${label}: ${s}`)
  }
  push('Test Item', ti.item)
  push('Model No', ti.model)
  push('Drawing No', ti.drawing)
  const sizeStr = [ti.dimL && ti.dimL + '"', ti.dimW && ti.dimW + '"', ti.dimH && ti.dimH + '"'].filter(Boolean).join(' x ')
  if (sizeStr) lines.push(`Size: ${sizeStr}`)
  if (ti.wt) lines.push(`Weight: ${ti.wt} lbs`)
  const pwrParts = [
    ti.volt && ti.volt + ' V ' + (ti.pwrType || 'AC'),
    ti.phase && ti.phase + ' Ph',
    ti.hz && ti.hz + ' Hz',
    ti.amps && ti.amps + ' A',
  ].filter(Boolean)
  if (pwrParts.length) lines.push(`Power: ${pwrParts.join(', ')}`)
  if (str(ti.loads)) lines.push(str(ti.loads))
  if (str(ti.mounting)) lines.push(str(ti.mounting))
  if (str(ti.pressureFlow)) lines.push(str(ti.pressureFlow))
  return lines.join('\n')
}

/** qi.relatedContacts [{name,email}] → Workspace [{full_name,email}]. */
export function collectRelatedContacts(qi: Record<string, any> | undefined): Array<{ full_name: string; email: string }> {
  const rcs = Array.isArray(qi?.relatedContacts) ? qi!.relatedContacts : []
  return rcs
    .filter((rc: any) => rc && (rc.name || rc.email))
    .map((rc: any) => ({ full_name: str(rc.name), email: str(rc.email) }))
}

export interface WorkspaceLine { code?: string | null; label: string; desc?: string; price: number }
export interface WorkspaceTask { name: string; description: null; sales_category: string | null; fixed_price: number; quote_number: string | null; po_number: string | null }

const combineName = (label?: string, desc?: string) => {
  const l = str(label)
  const d = str(desc)
  return d ? (l ? l + ', ' + d : d) : l
}

/** Unified V2 line items → Workspace tasks (Workspace owns numbering). */
export function collectTasks(lines: WorkspaceLine[], quoteNumber: string | null, poNumber: string | null): WorkspaceTask[] {
  return (lines || [])
    .filter((l) => l.label || l.price)
    .map((l) => ({
      name: combineName(l.label, l.desc) || 'Line Item',
      description: null,
      sales_category: str(l.code) || null,
      fixed_price: sf(l.price),
      quote_number: quoteNumber,
      po_number: poNumber,
    }))
}

export interface BudgetRow { desc?: string; qty?: string | number; unitCost?: string | number }
export function collectBudgetExpenses(budget: { rows?: BudgetRow[] } | undefined): Array<{ name: string; planned_amount: number }> {
  const out: Array<{ name: string; planned_amount: number }> = []
  ;(budget?.rows || []).forEach((r) => {
    const qty = sf(r.qty) || 1
    const unitCost = sf(r.unitCost)
    const planned = qty * unitCost
    if (!str(r.desc) && planned === 0) return
    out.push({ name: str(r.desc) || 'Budget Material', planned_amount: planned })
  })
  return out
}

// ── High-level actions ───────────────────────────────────────────────────────

export interface ProjectLookup { found: boolean; project_id?: string; project_name?: string; client_company?: string; task_count?: number }
export interface CreateResult { project_id: string; task_count?: number; expense_count?: number }
export interface AppendResult { project_id: string; tasks_added?: number; expenses_added?: number }

export interface ProjectSourceInput {
  quoteId: string
  qi: Record<string, any>
  ti: Record<string, any>
  wonInfo: { wonDate?: string; jobNum?: string; poNum?: string }
  lines: WorkspaceLine[]
  budget?: { rows?: BudgetRow[] }
  specsText?: string // already-combined specifications for the project description
  notesText?: string
}

/** Look up a Workspace project by Job #. */
export function lookupProjectByJobNumber(jobNumber: string): Promise<ProjectLookup> {
  return rpcCall<ProjectLookup>('lookup_project_by_job_number', { job_number: jobNumber })
}

function buildCreatePayload(input: ProjectSourceInput) {
  const { quoteId, qi, ti, wonInfo, lines, budget } = input
  const jobNum = str(wonInfo.jobNum)
  return {
    source: 'nuforce',
    source_quote_id: quoteId,
    source_quote_number: str(qi.opp) || null,
    project: { name: jobNum, description: combineSpecs(input.specsText, input.notesText) },
    project_info: {
      po_number: str(wonInfo.poNum) || null,
      quote_number: str(qi.opp) || null,
      client_name: str(qi.account) || null,
      client_salesforce_id: null,
      primary_contact: { full_name: str(qi.contact) || null, email: str(qi.email) || null, phone: null },
      phase: 'Waiting on TP Approval',
      status: 'jobprep',
      test_article_description: buildTestArticleDescription(ti),
      dpas: str(ti.dpas) || null,
      cui: str(ti.docRestriction) || null,
      dcas: str(ti.gsi) || null,
      customer_witness: str(ti.witness) || null,
    },
    related_contacts: collectRelatedContacts(qi),
    tasks: collectTasks(lines, str(qi.opp) || null, str(wonInfo.poNum) || null),
    expenses: collectBudgetExpenses(budget),
  }
}

/** Create a new Workspace project from this quote. Returns the RPC result. */
export function createProjectFromNuforce(input: ProjectSourceInput): Promise<CreateResult> {
  return rpcCall<CreateResult>('create_project_from_nuforce', { payload: buildCreatePayload(input) })
}

/** Append this quote's tasks/expenses to an existing Workspace project. */
export function appendToProject(input: ProjectSourceInput): Promise<AppendResult> {
  const { quoteId, qi, wonInfo, lines, budget } = input
  const payload = {
    source: 'nuforce',
    source_quote_id: quoteId,
    source_quote_number: str(qi.opp) || null,
    project: { name: str(wonInfo.jobNum) },
    project_info: { po_number: str(wonInfo.poNum) || null, quote_number: str(qi.opp) || null },
    tasks: collectTasks(lines, str(qi.opp) || null, str(wonInfo.poNum) || null),
    expenses: collectBudgetExpenses(budget),
  }
  return rpcCall<AppendResult>('append_to_project_from_nuforce', { payload })
}

/** Persist (or clear) the quote↔project link. Best-effort; caller handles errors. */
export async function setWorkspaceLink(quoteId: string, projectId: string | null): Promise<void> {
  await restFetch('PATCH', `quotes?id=eq.${encodeURIComponent(quoteId)}`, { body: { workspace_project_id: projectId } })
}

/** The Workspace project URL for a given id. */
export function workspaceProjectUrl(projectId: string): string {
  return `${WORKSPACE_BASE}/#project/${encodeURIComponent(projectId)}/info`
}

/** Notify owners a job was opened (best-effort; never throws to the caller). */
export async function notifyClosedWon(data: Record<string, unknown>): Promise<void> {
  try {
    await invokeFunction('send-notification', { type: 'nuforce_quote_closed_won', data })
  } catch {
    /* notifications are best-effort */
  }
}

/** Friendly message for common Workspace RPC failures. */
export function describeWorkspaceError(err: unknown, opts: { accountName?: string; actionLabel?: string } = {}): string {
  const raw = err instanceof Error ? err.message : String(err)
  const actionLabel = opts.actionLabel || 'complete that in Workspace'
  if (/client.*not.*found|no.*client|unknown client/i.test(raw)) {
    return `Workspace couldn’t find the client${opts.accountName ? ` “${opts.accountName}”` : ''}. Create/link it in Workspace first, then retry.`
  }
  if (/incomplete|missing|required/i.test(raw)) {
    return 'Workspace rejected this quote’s details as incomplete. Check the account name, contact, and line items are filled in, then try again.'
  }
  if (/no project_id/i.test(raw)) {
    return 'Workspace returned an unexpected response, so the project may have been created without being linked here. Check Workspace for this Job # before retrying.'
  }
  return `Couldn’t ${actionLabel}. ${raw}`
}

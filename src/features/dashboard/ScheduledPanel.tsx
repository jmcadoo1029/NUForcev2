import { useEffect, useState, type CSSProperties } from 'react'
import { CardLabel, Button, Modal, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { useFeature } from '../../lib/perms'
import { getSessionEmail } from '../../lib/auth'
import { fmtDate } from '../../lib/format'
import { CODE_OPTIONS } from '../../lib/productName'
import { fetchCampaignOptions, fetchTemplates, type CampaignOption, type EmailTemplate as CustomTemplate } from '../../lib/massEmail'
import { searchClients, type ClientRow } from '../../lib/directory'
import { Autocomplete } from '../quote/form/Autocomplete'
import type { TemplateKey } from '../../lib/emailTemplates'
import {
  fetchSchedules, createSchedule, updateSchedule, setScheduleEnabled, deleteSchedule,
  type Schedule, type NewSchedule, type ScheduleKind, type Cadence, type Audience, type RuleType,
} from '../../lib/scheduler'

// Scheduled — recurring/one-off blasts and rule-based drips. Managers create
// schedules here; the daily tick queues due ones into "Needs your attention" for a
// manager to review and send. Rendered as a Customer Contact → Outreach sub-tab.

const BUILTIN_TPLS: { key: TemplateKey; label: string }[] = [
  { key: 'mass_all', label: 'All contacts' },
  { key: 'mass_code', label: 'Product — quoted' },
  { key: 'mass_code_performed', label: 'Product — performed' },
  { key: 'mass_campaign', label: 'Campaign' },
  { key: 'mass_account', label: 'Account' },
  { key: 'mass_reengage', label: 'Re-engage' },
]

const input: CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }
const label: CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: 4, marginTop: 'var(--sp-3)' }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

function cadenceText(s: Schedule): string {
  if (s.cadence === 'once') return s.run_on ? `Once · ${s.run_on}` : 'Once'
  if (s.cadence === 'monthly') return `Monthly · day ${s.day_of_month || 1}`
  return s.run_on ? `Annually · ${s.run_on.slice(5)}` : 'Annually'
}
function summaryText(s: Schedule): string {
  const c = s.config || {}
  if (s.kind === 'rule') {
    if (c.rule === 'quoted_code_ago') return `Quoted ${c.code || '—'} over ${c.ruleMonths || 12} mo ago`
    return `Not quoted in over ${c.ruleMonths || 12} mo`
  }
  const a = c.audience || 'all'
  if (a === 'all') return 'All contacts'
  if (a === 'code') return `Quoted code ${c.code || '—'}`
  if (a === 'campaign') return `Campaign: ${c.campaignName || '—'}`
  return `Account: ${c.accountName || '—'}`
}

export function ScheduledPanel() {
  const { showToast } = useToast()
  const me = getSessionEmail() || ''
  // Creating/editing schedules is separate from viewing this tab — a manager can let
  // someone watch the queue without letting them change what's scheduled.
  const canManage = useFeature('schedule_sends')
  const [list, setList] = useState<Schedule[] | null>(null)
  const [err, setErr] = useState('')
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [customTpls, setCustomTpls] = useState<CustomTemplate[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // form state
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ScheduleKind>('calendar')
  const [tplSel, setTplSel] = useState('key:mass_all') // 'key:<k>' | 'custom:<id>'
  const [audience, setAudience] = useState<Audience>('all')
  const [code, setCode] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [clientId, setClientId] = useState('')
  const [accountText, setAccountText] = useState('')
  const [rule, setRule] = useState<RuleType>('not_quoted')
  const [ruleMonths, setRuleMonths] = useState(12)
  const [cadence, setCadence] = useState<Cadence>('once')
  const [runOn, setRunOn] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [cooldownMonths, setCooldownMonths] = useState(12)

  const load = () => fetchSchedules().then(setList).catch((e) => setErr(errMsg(e)))
  useEffect(() => { load() }, [])
  useEffect(() => { fetchCampaignOptions().then(setCampaigns).catch(() => {}); fetchTemplates().then(setCustomTpls).catch(() => {}) }, [])

  const resetForm = () => {
    setName(''); setKind('calendar'); setTplSel('key:mass_all'); setAudience('all'); setCode(''); setCampaignId(''); setClientId(''); setAccountText('')
    setRule('not_quoted'); setRuleMonths(12); setCadence('once'); setRunOn(''); setDayOfMonth(1); setCooldownMonths(12)
  }
  const openNew = () => { resetForm(); setEditingId(null); setFormOpen(true) }
  const openEdit = (s: Schedule) => {
    const c = s.config || {}
    setName(s.name); setKind(s.kind)
    setTplSel(s.template_id ? `custom:${s.template_id}` : `key:${s.template_key || 'mass_all'}`)
    setAudience(c.audience || 'all'); setCode(c.code || ''); setCampaignId(c.campaignId || ''); setClientId(c.clientId || ''); setAccountText(c.accountName || '')
    setRule(c.rule || 'not_quoted'); setRuleMonths(c.ruleMonths || 12)
    setCadence(s.cadence); setRunOn(s.run_on || ''); setDayOfMonth(s.day_of_month || 1); setCooldownMonths(s.cooldown_months || 12)
    setEditingId(s.id); setFormOpen(true)
  }

  const save = async () => {
    if (!canManage) { showToast('You don’t have permission to change schedules.', 'warn'); return }
    if (!name.trim()) { showToast('Give the schedule a name.', 'warn'); return }
    if (cadence === 'once' && !runOn) { showToast('Pick a date for a one-time send.', 'warn'); return }
    if (cadence === 'annually' && !runOn) { showToast('Pick the annual date.', 'warn'); return }
    if (kind === 'calendar' && audience === 'code' && !code) { showToast('Pick a product code.', 'warn'); return }
    if (kind === 'calendar' && audience === 'campaign' && !campaignId) { showToast('Pick a campaign.', 'warn'); return }
    if (kind === 'calendar' && audience === 'account' && !clientId) { showToast('Pick an account.', 'warn'); return }
    if (kind === 'rule' && rule === 'quoted_code_ago' && !code) { showToast('Pick a product code for the rule.', 'warn'); return }
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }

    const template_key = tplSel.startsWith('key:') ? (tplSel.slice(4) as TemplateKey) : null
    const template_id = tplSel.startsWith('custom:') ? tplSel.slice(7) : null
    const config: NewSchedule['config'] = kind === 'rule'
      ? { rule, ruleMonths, ...(rule === 'quoted_code_ago' ? { code } : {}) }
      : {
          audience,
          ...(audience === 'code' ? { code } : {}),
          ...(audience === 'campaign' ? { campaignId, campaignName: campaigns.find((c) => c.id === campaignId)?.name || '' } : {}),
          ...(audience === 'account' ? { clientId, accountName: accountText } : {}),
        }
    const effCadence: Cadence = kind === 'rule' && cadence === 'once' ? 'monthly' : cadence
    const payload: NewSchedule = {
      name: name.trim(), kind, enabled: true, template_key, template_id, config,
      cadence: effCadence, run_on: effCadence === 'monthly' ? null : (runOn || null),
      day_of_month: effCadence === 'monthly' ? dayOfMonth : null,
      cooldown_months: cooldownMonths, created_by: me,
    }
    setBusy(true)
    try {
      if (editingId) await updateSchedule(editingId, payload)
      else await createSchedule(payload)
      showToast(editingId ? 'Schedule updated' : 'Schedule created', 'success')
      setFormOpen(false); setEditingId(null); load()
    } catch (e) { showToast('Save failed: ' + errMsg(e), 'error', 6000) } finally { setBusy(false) }
  }

  const toggle = async (s: Schedule) => {
    if (!canManage) { showToast('You don’t have permission to change schedules.', 'warn'); return }
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    try { await setScheduleEnabled(s.id, !s.enabled); load() } catch (e) { showToast('Couldn’t update: ' + errMsg(e), 'error', 6000) }
  }
  const del = async (s: Schedule) => {
    if (!canManage) { showToast('You don’t have permission to change schedules.', 'warn'); return }
    if (!window.confirm(`Delete schedule “${s.name}”? Its pending review items are removed too.`)) return
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    try { await deleteSchedule(s.id); showToast('Deleted', 'info'); load() } catch (e) { showToast('Delete failed: ' + errMsg(e), 'error', 6000) }
  }

  const seg = (on: boolean, first: boolean): CSSProperties => ({ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, padding: '6px 14px', border: 'none', borderLeft: first ? 'none' : '1px solid var(--border-strong)', background: on ? 'var(--accent)' : '#fff', color: on ? '#fff' : 'var(--muted)', cursor: 'pointer' })

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <div>
          <CardLabel>Scheduled sends</CardLabel>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginTop: 2 }}>Calendar blasts and rule-based drips. Due sends queue into “Needs your attention” for review before anything goes out.</div>
        </div>
        {canManage
          ? <Button variant="primary" small onClick={openNew}>+ New schedule</Button>
          : <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)', fontStyle: 'italic' }}>View only — a manager can add or change schedules</span>}
      </div>

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load: {err}</div>}
      {!err && !list && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}
      {!err && list && list.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', fontStyle: 'italic' }}>No schedules yet. Create one to automate a recurring blast or a drip.</div>}

      {!err && list && list.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          {list.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '10px 12px', borderBottom: '1px solid var(--border)', opacity: s.enabled ? 1 : 0.55 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{s.name} <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 600, color: s.kind === 'rule' ? 'var(--info)' : 'var(--muted)' }}>· {s.kind === 'rule' ? 'Rule drip' : 'Calendar'}</span></div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{summaryText(s)} · {cadenceText(s)}{s.next_fire_at ? ` · next ${fmtDate(s.next_fire_at)}` : ''}</div>
              </div>
              {canManage ? (
                <>
                  <button onClick={() => toggle(s)} title={s.enabled ? 'Pause' : 'Resume'} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: s.enabled ? 'var(--pos)' : 'var(--muted)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>{s.enabled ? 'On' : 'Paused'}</button>
                  <button onClick={() => openEdit(s)} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => del(s)} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--dim)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                </>
              ) : (
                <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: s.enabled ? 'var(--pos)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{s.enabled ? 'On' : 'Paused'}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <Modal title={editingId ? 'Edit schedule' : 'New schedule'} onClose={() => !busy && setFormOpen(false)} width={620}>
          <label style={{ ...label, marginTop: 0 }}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New-Year capabilities blast" style={input} autoFocus />

          <label style={label}>Type</label>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => setKind('calendar')} style={seg(kind === 'calendar', true)}>Calendar send</button>
            <button onClick={() => { setKind('rule'); if (cadence === 'once') setCadence('monthly') }} style={seg(kind === 'rule', false)}>Rule-based drip</button>
          </div>

          <label style={label}>Template</label>
          <select value={tplSel} onChange={(e) => setTplSel(e.target.value)} style={input}>
            <optgroup label="Built-in">
              {BUILTIN_TPLS.map((t) => <option key={t.key} value={`key:${t.key}`}>{t.label}</option>)}
            </optgroup>
            {customTpls.length > 0 && (
              <optgroup label="Your reusable templates">
                {customTpls.map((t) => <option key={t.id} value={`custom:${t.id}`}>{t.name}</option>)}
              </optgroup>
            )}
          </select>

          {kind === 'calendar' ? (
            <>
              <label style={label}>Audience</label>
              <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)} style={input}>
                <option value="all">All contacts</option>
                <option value="code">Everyone quoted a product code</option>
                <option value="campaign">A campaign</option>
                <option value="account">An account</option>
              </select>
              {audience === 'code' && (
                <select value={code} onChange={(e) => setCode(e.target.value)} style={{ ...input, marginTop: 'var(--sp-2)' }}>
                  <option value="">— Product code —</option>
                  {CODE_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.code} — {o.label}</option>)}
                </select>
              )}
              {audience === 'campaign' && (
                <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={{ ...input, marginTop: 'var(--sp-2)' }}>
                  <option value="">— Campaign —</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {audience === 'account' && (
                <div style={{ marginTop: 'var(--sp-2)' }}>
                  <Autocomplete<ClientRow>
                    value={accountText}
                    onValueChange={(v) => { setAccountText(v); if (!v.trim()) setClientId('') }}
                    search={(t) => searchClients(t)}
                    itemKey={(c) => c.id}
                    itemPrimary={(c) => c.name || '(unnamed account)'}
                    itemSecondary={(c) => [c.city, c.state].filter(Boolean).join(', ')}
                    onPick={(c) => { setClientId(c.id); setAccountText(c.name || '') }}
                    placeholder="Search accounts…"
                    minChars={2}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <label style={label}>Rule</label>
              <select value={rule} onChange={(e) => setRule(e.target.value as RuleType)} style={input}>
                <option value="not_quoted">Not quoted in over N months</option>
                <option value="quoted_code_ago">Quoted a product code over N months ago</option>
              </select>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', marginTop: 'var(--sp-2)', flexWrap: 'wrap' }}>
                {rule === 'quoted_code_ago' && (
                  <select value={code} onChange={(e) => setCode(e.target.value)} style={{ ...input, width: 'auto', minWidth: 200 }}>
                    <option value="">— Product code —</option>
                    {CODE_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.code} — {o.label}</option>)}
                  </select>
                )}
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }}>threshold</span>
                <input type="number" min={1} value={ruleMonths} onChange={(e) => setRuleMonths(Math.max(1, Number(e.target.value) || 1))} style={{ ...input, width: 80 }} />
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }}>months</span>
              </div>
              <label style={label}>Don’t re-email the same contact within</label>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                <input type="number" min={1} value={cooldownMonths} onChange={(e) => setCooldownMonths(Math.max(1, Number(e.target.value) || 1))} style={{ ...input, width: 80 }} />
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }}>months (cooldown)</span>
              </div>
            </>
          )}

          <label style={label}>{kind === 'rule' ? 'How often to check' : 'When'}</label>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
            {kind === 'calendar' && <button onClick={() => setCadence('once')} style={seg(cadence === 'once', true)}>Once</button>}
            <button onClick={() => setCadence('monthly')} style={seg(cadence === 'monthly', kind === 'rule')}>Monthly</button>
            <button onClick={() => setCadence('annually')} style={seg(cadence === 'annually', false)}>Annually</button>
          </div>
          <div style={{ marginTop: 'var(--sp-2)' }}>
            {cadence === 'once' && <input type="date" value={runOn} onChange={(e) => setRunOn(e.target.value)} style={{ ...input, width: 'auto' }} />}
            {cadence === 'monthly' && (
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }}>on day</span>
                <input type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value) || 1)))} style={{ ...input, width: 80 }} />
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--dim)' }}>of each month (1–28)</span>
              </div>
            )}
            {cadence === 'annually' && (
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                <input type="date" value={runOn} onChange={(e) => setRunOn(e.target.value)} style={{ ...input, width: 'auto' }} />
                <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>the month & day repeat each year</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
            <Button variant="ghost" small disabled={busy} onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" small disabled={busy} onClick={save}>{busy ? 'Saving…' : editingId ? 'Save schedule' : 'Create schedule'}</Button>
          </div>
          {!WRITES_ENABLED && <div style={{ color: 'var(--warn)', fontStyle: 'italic', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-2)', textAlign: 'right' }}>Preview — writes are off, nothing saves.</div>}
        </Modal>
      )}
    </>
  )
}

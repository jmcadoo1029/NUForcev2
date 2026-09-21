import { useEffect, useState, type CSSProperties } from 'react'
import { Modal, useToast } from '../../components'
import { WRITES_ENABLED } from '../../lib/config'
import { getSessionEmail } from '../../lib/auth'
import { prettifyEmail } from '../../lib/text'
import {
  fetchUsers, saveUserSettings, capsSummary, defaultDelivery, defaultApprovals, effective, type UserRow,
} from '../../lib/userAdmin'

// Users — a managers-only directory (More → Users). Lists everyone with their role
// and what that role grants (read-only baseline), then per-user NUForce toggles for
// email notifications. Overrides live in nuforce_user_settings; the shared user
// tables are never written.

const input: CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 'var(--fs-sm)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text)', boxSizing: 'border-box' }
const secLabel: CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }

function Toggle({ label, help, on, isDefault, disabled, onChange, onReset }: { label: string; help: string; on: boolean; isDefault: boolean; disabled?: boolean; onChange: (v: boolean) => void; onReset: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => onChange(!on)}
        disabled={disabled}
        role="switch"
        aria-checked={on}
        style={{ flexShrink: 0, width: 42, height: 24, borderRadius: 999, border: 'none', background: on ? 'var(--pos)' : 'var(--border-strong)', position: 'relative', cursor: disabled ? 'default' : 'pointer', transition: 'background .15s', marginTop: 2 }}
      >
        <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .15s' }} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{label} {isDefault ? <span style={{ fontWeight: 400, fontSize: 'var(--fs-caption)', color: 'var(--dim)' }}>· default</span> : <button onClick={onReset} disabled={disabled} style={{ fontFamily: 'inherit', fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>· reset to default</button>}</div>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', lineHeight: 1.5, marginTop: 2 }}>{help}</div>
      </div>
    </div>
  )
}

export function UsersAdmin({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast()
  const me = getSessionEmail() || ''
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [err, setErr] = useState('')
  const [selEmail, setSelEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    fetchUsers().then((u) => { if (alive) setUsers(u) }).catch((e) => alive && setErr(String(e?.message || e)))
    return () => { alive = false }
  }, [])

  const sel = (users || []).find((u) => u.email === selEmail) || null
  const t = q.trim().toLowerCase()
  const filtered = (users || []).filter((u) => !t || `${u.name} ${u.email} ${u.roleName}`.toLowerCase().includes(t))

  const setToggle = async (u: UserRow, field: 'notify_delivery' | 'notify_approvals', value: boolean | null) => {
    if (!WRITES_ENABLED) { showToast('Writes are off (preview).', 'warn'); return }
    setBusy(true)
    try {
      await saveUserSettings(u.email, { [field]: value }, me)
      setUsers((prev) => (prev || []).map((x) => (x.email === u.email ? { ...x, ...(field === 'notify_delivery' ? { notifyDelivery: value } : { notifyApprovals: value }) } : x)))
    } catch (e) {
      showToast('Save failed: ' + (e instanceof Error ? e.message : String(e)), 'error', 6000)
    } finally { setBusy(false) }
  }

  return (
    <Modal title="Users" onClose={onClose} width={860}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>
        Everyone in the system and what their role grants. Roles are managed in your shared workspace — here you tailor each person’s NUForce email notifications.
      </div>

      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)' }}>Couldn’t load users: {err}</div>}
      {!err && !users && <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>Loading…</div>}

      {!err && users && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--sp-5)' }}>
          <div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, role…" style={{ ...input, marginBottom: 'var(--sp-2)' }} />
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: 460, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 'var(--fs-sm)' }}>No matches.</div>
              ) : filtered.map((u) => {
                const active = u.email === selEmail
                const tailored = u.notifyDelivery !== null || u.notifyApprovals !== null
                return (
                  <div key={u.email} onClick={() => setSelEmail(u.email)} style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: active ? 'var(--accent-soft)' : 'transparent' }}>
                    <div style={{ fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)' }}>{u.name}{tailored && <span title="Has custom notification settings" style={{ color: 'var(--accent)' }}> •</span>}</div>
                    <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email} · {u.roleName}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 6 }}>{users.length} user{users.length !== 1 ? 's' : ''}</div>
          </div>

          <div>
            {!sel ? (
              <div style={{ color: 'var(--muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-4) 0' }}>Select a person to see their role and tailor their notifications.</div>
            ) : (
              <>
                <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, color: 'var(--text)' }}>{sel.name}</div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)' }}>{sel.email}</div>

                <div style={secLabel}>Role · {sel.roleName}</div>
                <ul style={{ margin: '0 0 var(--sp-4)', paddingLeft: 18, color: 'var(--text)', fontSize: 'var(--fs-sm)', lineHeight: 1.7 }}>
                  {capsSummary(sel.caps).map((c) => <li key={c}>{c}</li>)}
                </ul>

                <div style={secLabel}>Email notifications</div>
                <Toggle
                  label="Delivery-problem alerts"
                  help="Emails this person when one of their quote/follow-up sends bounces, is marked spam, or is delayed. Enforced by NUForce."
                  on={effective(sel.notifyDelivery, defaultDelivery(sel.caps))}
                  isDefault={sel.notifyDelivery === null}
                  disabled={busy}
                  onChange={(v) => setToggle(sel, 'notify_delivery', v)}
                  onReset={() => setToggle(sel, 'notify_delivery', null)}
                />
                <Toggle
                  label="Approval & workflow emails"
                  help="Submitted / approved / reopen / lost notifications. These are sent by the shared workspace mailer, so this preference is saved but only takes effect once that mailer honors it."
                  on={effective(sel.notifyApprovals, defaultApprovals(sel.caps))}
                  isDefault={sel.notifyApprovals === null}
                  disabled={busy}
                  onChange={(v) => setToggle(sel, 'notify_approvals', v)}
                  onReset={() => setToggle(sel, 'notify_approvals', null)}
                />

                {!WRITES_ENABLED && <div style={{ color: 'var(--warn)', fontStyle: 'italic', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-3)' }}>Preview — writes are off, changes won’t save.</div>}
                <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--dim)', marginTop: 'var(--sp-3)' }}>Signed in as {prettifyEmail(me)} · changes are logged with your name.</div>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

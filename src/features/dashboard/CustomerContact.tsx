import { useEffect, useState, type CSSProperties } from 'react'
import { Card } from '../../components'
import { useFeature } from '../../lib/perms'
import { ReEngageContacts } from './ReEngageContacts'
import { MassEmails } from './MassEmails'
import { BadContactsCard } from './BadContactsCard'
import { CampaignsPanel } from './Campaigns'
import { ScheduledPanel } from './ScheduledPanel'

// Customer Contact — the home for outreach + contact hygiene. Visible to everyone,
// organized into two groups:
//   • Contacts — Re-engage (dormant list) + Bad contacts (hygiene)
//   • Outreach — Campaigns (build lists; everyone) + Mass Emails (send; managers only)
// Mass Emails is the only manager-gated view, so its button is hidden for
// non-managers and a non-manager can never land on it. Because a campaign is emailed
// from the Mass Emails composer, sending from a campaign stays manager-gated there.

type Sub = 'reengage' | 'badcontacts' | 'campaigns' | 'massemails' | 'scheduled'

interface Tab { key: Sub; label: string; managerOnly?: boolean }
const GROUPS: { label: string; tabs: Tab[] }[] = [
  { label: 'Contacts', tabs: [{ key: 'reengage', label: 'Re-engage' }, { key: 'badcontacts', label: 'Bad contacts' }] },
  { label: 'Outreach', tabs: [{ key: 'campaigns', label: 'Campaigns' }, { key: 'massemails', label: 'Mass Emails', managerOnly: true }, { key: 'scheduled', label: 'Scheduled', managerOnly: true }] },
]

const seg = (active: boolean, first: boolean): CSSProperties => ({
  fontFamily: 'inherit',
  fontSize: 'var(--fs-sm)',
  fontWeight: 600,
  padding: '7px 16px',
  border: 'none',
  borderLeft: first ? 'none' : '1px solid var(--border-strong)',
  background: active ? 'var(--accent)' : '#fff',
  color: active ? '#fff' : 'var(--muted)',
  cursor: 'pointer',
})

const groupLabel: CSSProperties = { fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 5 }

export function CustomerContact() {
  // Per-feature access (Users area overrides, defaulting to the manager role). Mass
  // Emails and Scheduled are gated independently so a manager can grant/revoke either
  // for a specific person.
  const canMass = useFeature('mass_emails')
  const canSched = useFeature('scheduled')
  const allowed = (t: Sub) => (t === 'massemails' ? canMass : t === 'scheduled' ? canSched : true)
  const [sub, setSub] = useState<Sub>('reengage')

  // Never sit on a tab this person can't access.
  useEffect(() => {
    if (!allowed(sub)) setSub('reengage')
  }, [canMass, canSched, sub])
  const view: Sub = allowed(sub) ? sub : 'reengage'

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--sp-6)', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        {GROUPS.map((group) => {
          const tabs = group.tabs.filter((t) => allowed(t.key))
          if (!tabs.length) return null
          return (
            <div key={group.label}>
              <div style={groupLabel}>{group.label}</div>
              <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 9, overflow: 'hidden' }}>
                {tabs.map((t, i) => (
                  <button key={t.key} style={seg(view === t.key, i === 0)} onClick={() => setSub(t.key)}>{t.label}</button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {view === 'reengage' ? <ReEngageContacts />
        : view === 'badcontacts' ? <BadContactsCard />
        : view === 'campaigns' ? <Card><CampaignsPanel /></Card>
        : view === 'scheduled' ? <Card><ScheduledPanel /></Card>
        : <MassEmails />}
    </>
  )
}

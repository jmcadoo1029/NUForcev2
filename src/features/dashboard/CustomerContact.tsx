import { useEffect, useState, type CSSProperties } from 'react'
import { Button } from '../../components'
import { useCanViewManager } from '../../lib/perms'
import { ReEngageContacts } from './ReEngageContacts'
import { MassEmails } from './MassEmails'
import { BadContactsCard } from './BadContactsCard'
import { Campaigns } from './Campaigns'

// Customer Contact — the home for outreach + contact hygiene. Visible to everyone.
// Sub-tabs: the Re-engage dormant-contact list and the Bad Contacts widget are open
// to all; Mass Emails (and the Campaigns manager it draws audiences from) are
// manager-only, so those controls are hidden for non-managers and a non-manager can
// never land on the Mass Emails view.

type Sub = 'reengage' | 'massemails' | 'badcontacts'

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

export function CustomerContact() {
  const { canView } = useCanViewManager() // manager view — gates Mass Emails + Campaigns
  const [sub, setSub] = useState<Sub>('reengage')
  const [campaignsOpen, setCampaignsOpen] = useState(false)

  // If a non-manager is (or becomes) parked on the manager-only Mass Emails view,
  // send them back to the everyone-visible Re-engage list.
  useEffect(() => {
    if (!canView && sub === 'massemails') setSub('reengage')
  }, [canView, sub])

  const view: Sub = !canView && sub === 'massemails' ? 'reengage' : sub

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 9, overflow: 'hidden' }}>
          <button style={seg(view === 'reengage', true)} onClick={() => setSub('reengage')}>Re-engage</button>
          {canView && <button style={seg(view === 'massemails', false)} onClick={() => setSub('massemails')}>Mass Emails</button>}
          <button style={seg(view === 'badcontacts', false)} onClick={() => setSub('badcontacts')}>Bad Contacts</button>
        </div>
        {canView && <Button variant="secondary" onClick={() => setCampaignsOpen(true)}>Manage Campaigns</Button>}
      </div>

      {view === 'reengage' ? <ReEngageContacts /> : view === 'massemails' ? <MassEmails /> : <BadContactsCard />}

      {campaignsOpen && canView && <Campaigns onClose={() => setCampaignsOpen(false)} />}
    </>
  )
}

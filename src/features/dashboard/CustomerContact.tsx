import { useState, type CSSProperties } from 'react'
import { Button } from '../../components'
import { ReEngageContacts } from './ReEngageContacts'
import { MassEmails } from './MassEmails'
import { BadContactsCard } from './BadContactsCard'
import { Campaigns } from './Campaigns'

// Customer Contact — the home for outreach + contact hygiene. Sub-tabs: the Re-engage
// dormant-contact list, the Mass Emails composer, and the Bad Contacts widget; the
// Campaigns manager opens from here too.

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
  const [sub, setSub] = useState<Sub>('reengage')
  const [campaignsOpen, setCampaignsOpen] = useState(false)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 9, overflow: 'hidden' }}>
          <button style={seg(sub === 'reengage', true)} onClick={() => setSub('reengage')}>Re-engage</button>
          <button style={seg(sub === 'massemails', false)} onClick={() => setSub('massemails')}>Mass Emails</button>
          <button style={seg(sub === 'badcontacts', false)} onClick={() => setSub('badcontacts')}>Bad Contacts</button>
        </div>
        <Button variant="secondary" onClick={() => setCampaignsOpen(true)}>Manage Campaigns</Button>
      </div>

      {sub === 'reengage' ? <ReEngageContacts /> : sub === 'massemails' ? <MassEmails /> : <BadContactsCard />}

      {campaignsOpen && <Campaigns onClose={() => setCampaignsOpen(false)} />}
    </>
  )
}

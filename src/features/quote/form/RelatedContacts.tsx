import { useState } from 'react'
import { Card, CardLabel, Button } from '../../../components'
import { CopyBtn, regInput } from './fields'
import type { RelatedContact } from '../../../data/quoteDefaults'
import { Autocomplete } from './Autocomplete'
import { searchPeople, personName, type PersonRow } from '../../../lib/directory'

// Related Contacts — mirrors Classic's additional-contacts area. Display in view
// mode (with per-contact copy-email), editable rows in edit mode. Contacts can be
// searched across ALL accounts and added, or entered by hand as custom rows.
export function RelatedContacts({ contacts, editing, onChange }: { contacts: RelatedContact[]; editing: boolean; onChange: (next: RelatedContact[]) => void }) {
  const [search, setSearch] = useState('')
  const upd = (i: number, patch: Partial<RelatedContact>) => onChange(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const remove = (i: number) => onChange(contacts.filter((_, j) => j !== i))
  const add = () => onChange([...contacts, { name: '', title: '', email: '', phone: '' }])
  const addPerson = (p: PersonRow) => { onChange([...contacts, { name: personName(p), title: '', email: p.email || '', phone: '' }]); setSearch('') }

  if (!editing && contacts.length === 0) return null

  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <CardLabel>Related contacts</CardLabel>

      {!editing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--sp-4)', marginTop: 'var(--sp-2)' }}>
          {contacts.map((c, i) => (
            <div key={i} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600 }}>{c.name || '—'}</div>
              {c.title && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>{c.title}</div>}
              {c.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, marginTop: 2 }}>
                  <a href={`mailto:${c.email}`} style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent)', textDecoration: 'none', overflowWrap: 'break-word', minWidth: 0 }}>{c.email}</a>
                  <CopyBtn text={c.email} />
                </div>
              )}
              {c.phone && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text)', marginTop: 2 }}>{c.phone}</div>}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1fr 26px', gap: 'var(--sp-2)', alignItems: 'center', padding: '4px 0 6px', fontSize: 'var(--fs-caption)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dim)' }}>
            <span>Name</span><span>Title</span><span>Email</span><span>Phone</span><span />
          </div>
          {contacts.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1fr 26px', gap: 'var(--sp-2)', alignItems: 'center', padding: '3px 0' }}>
              <input value={c.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Name" style={regInput} />
              <input value={c.title} onChange={(e) => upd(i, { title: e.target.value })} placeholder="Title" style={regInput} />
              <input value={c.email} onChange={(e) => upd(i, { email: e.target.value })} placeholder="Email" style={regInput} />
              <input value={c.phone} onChange={(e) => upd(i, { phone: e.target.value })} placeholder="Phone" style={regInput} />
              <button onClick={() => remove(i)} aria-label="Remove" title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          ))}
          <div style={{ marginTop: 'var(--sp-3)', display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240, maxWidth: 380 }}>
              <Autocomplete<PersonRow>
                value={search}
                onValueChange={setSearch}
                search={(t) => searchPeople(t)}
                itemKey={(p) => p.id}
                itemPrimary={(p) => personName(p) || '(no name)'}
                itemSecondary={(p) => [p.email, p.client_name].filter(Boolean).join(' · ')}
                onPick={addPerson}
                placeholder="Search contacts across all accounts to add…"
              />
            </div>
            <Button variant="secondary" small onClick={add}>+ Add custom</Button>
          </div>
        </>
      )}
    </Card>
  )
}

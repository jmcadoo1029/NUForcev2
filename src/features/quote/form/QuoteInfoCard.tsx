import { useCallback } from 'react'
import { Card, CardLabel } from '../../../components'
import { str } from '../../../lib/format'
import { TYPE_OPTS } from '../../../data/quoteDefaults'
import { Field, InfoField, RegField, EmailValue, regInput, infoGrid } from './fields'
import { Autocomplete } from './Autocomplete'
import { searchClients, fetchClientContacts, personName, type ClientRow, type PersonRow } from '../../../lib/directory'

// Quote Info card — two columns (left = quote meta, right = customer), read-only
// values in view mode and Classic's inputs in edit mode. Account links to the
// clients list; the primary contact pulls from the linked account's contacts.
// Both allow a free-typed custom value.
export function QuoteInfoCard({ editing, qi, setQi }: { editing: boolean; qi: Record<string, any>; setQi: (patch: Record<string, any>) => void }) {
  const s = str
  const clientId = s(qi.client_id)

  const pickClient = (c: ClientRow) =>
    setQi({ account: c.name || '', client_id: c.id, billTo: c.address || '', billToCity: [c.city, c.state, c.zip].filter(Boolean).join(', ') })

  // Primary-contact suggestions come from the linked account's contact list. An
  // empty term returns the whole list, so the field opens as a pick-list on focus
  // (see minChars={0} below). Stable per-account identity so it doesn't re-fetch on
  // every keystroke in other fields.
  const searchAccountContacts = useCallback(async (term: string): Promise<PersonRow[]> => {
    if (!clientId) return []
    const list = await fetchClientContacts(clientId)
    const t = term.toLowerCase()
    return list.filter((p) => (personName(p) + ' ' + (p.email || '')).toLowerCase().includes(t))
  }, [clientId])
  return (
    <Card style={{ marginBottom: 'var(--sp-4)' }}>
      <CardLabel>Quote info</CardLabel>
      {/* Two columns, mirroring Classic: left = quote meta, right = customer.
          Contact/Email stay together so the email sits under the name. */}
      <div style={infoGrid}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          <InfoField label="Business type" editing={editing} value={s(qi.type)} onChange={(v) => setQi({ type: v })} options={TYPE_OPTS} />
          <InfoField label="RFQ" editing={editing} value={s(qi.rfq)} onChange={(v) => setQi({ rfq: v })} />
          <InfoField label="Date" editing={editing} value={s(qi.date)} onChange={(v) => setQi({ date: v })} />
          <InfoField label="Revision" editing={editing} value={s(qi.rev)} onChange={(v) => setQi({ rev: v })} />
          <InfoField label="Revision date" editing={editing} value={s(qi.revDate)} onChange={(v) => setQi({ revDate: v })} />
          <InfoField label="Prepared by" editing={editing} value={s(qi.prepby)} onChange={(v) => setQi({ prepby: v })} />
          <InfoField label="Related opportunities" editing={editing} value={s(qi.relatedOpps)} onChange={(v) => setQi({ relatedOpps: v })} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {/* Account links to the shared clients list; typing a name that isn't
              picked leaves it as a custom (unlinked) account. */}
          {editing ? (
            <RegField label={<>Account {s(qi.account) && (clientId ? <span style={{ color: 'var(--pos)', fontWeight: 700, fontSize: 'var(--fs-caption)' }}>· linked</span> : <span style={{ color: 'var(--warn)', fontWeight: 700, fontSize: 'var(--fs-caption)' }}>· not linked</span>)}</>}>
              <Autocomplete<ClientRow>
                value={s(qi.account)}
                onValueChange={(v) => setQi({ account: v, client_id: '' })}
                search={(t) => searchClients(t)}
                itemKey={(c) => c.id}
                itemPrimary={(c) => c.name || '(unnamed)'}
                itemSecondary={(c) => [c.city, c.state].filter(Boolean).join(', ')}
                onPick={pickClient}
                placeholder="Search accounts, or type a custom name"
              />
            </RegField>
          ) : (
            <Field label="Account" value={s(qi.account)} />
          )}
          {editing ? (
            <RegField label="Address">
              <input value={s(qi.billTo)} onChange={(e) => setQi({ billTo: e.target.value })} placeholder="Street address" style={{ ...regInput, marginBottom: 6 }} />
              <input value={s(qi.billToCity)} onChange={(e) => setQi({ billToCity: e.target.value })} placeholder="City, State, Zip" style={regInput} />
            </RegField>
          ) : (
            <Field label="Address" value={[s(qi.billTo), s(qi.billToCity)].filter(Boolean).join(', ')} />
          )}
          {editing ? (
            <RegField label="Contact">
              <Autocomplete<PersonRow>
                value={s(qi.contact)}
                onValueChange={(v) => setQi({ contact: v })}
                search={searchAccountContacts}
                itemKey={(p) => p.id}
                itemPrimary={(p) => personName(p) || '(no name)'}
                itemSecondary={(p) => p.email || ''}
                onPick={(p) => setQi({ contact: personName(p), email: p.email || '' })}
                minChars={clientId ? 0 : 1}
                placeholder={clientId ? 'Click to choose a contact, or type a custom name' : 'Type a contact name'}
                emptyText={clientId ? 'No contacts on this account yet — type a custom name.' : 'Link an account above to pick its contacts.'}
              />
            </RegField>
          ) : (
            <InfoField label="Contact" editing={false} value={s(qi.contact)} onChange={(v) => setQi({ contact: v })} />
          )}
          {editing ? (
            <InfoField label="Email" editing value={s(qi.email)} onChange={(v) => setQi({ email: v })} />
          ) : (
            <EmailValue label="Email" value={s(qi.email)} />
          )}
        </div>
      </div>
    </Card>
  )
}

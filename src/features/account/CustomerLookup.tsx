import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../../components'
import { Autocomplete } from '../quote/form/Autocomplete'
import { searchAccounts } from '../../lib/accounts'

// A quick, dashboard-free way into an account: search a name and jump straight to
// the account page in Customer View (internal metrics hidden). Reachable from the
// app header so you never pass through the financial dashboard with a customer
// beside you.
export function CustomerLookup({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const go = (name: string) => { onClose(); navigate(`/account/${encodeURIComponent(name)}?view=customer`) }
  return (
    <Modal title="Look up a customer" onClose={onClose} width={460}>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', marginBottom: 'var(--sp-3)', lineHeight: 1.6 }}>
        Opens the account straight in <b>Customer View</b> — lifetime totals and win rate hidden, so it’s safe to turn the screen toward them.
      </div>
      <Autocomplete<string>
        value={text}
        onValueChange={setText}
        search={(t) => searchAccounts(t)}
        itemKey={(s) => s}
        itemPrimary={(s) => s}
        onPick={(s) => go(s)}
        placeholder="Search account name…"
        minChars={2}
        emptyText="No matching accounts."
      />
    </Modal>
  )
}

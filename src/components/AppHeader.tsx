import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CustomerLookup } from '../features/account/CustomerLookup'

// App-level brand bar — the NUForce logo on a white strip above every screen.
// The logo art has a near-white background, so a white bar makes it sit cleanly.
// The Customer Lookup button (right) is a dashboard-free way to open an account
// in Customer View — reachable from anywhere, so you never surface the financial
// dashboard with a customer beside you. On the home screen itself the Home and
// Customer Lookup buttons are hidden — the launcher already offers both, so the
// bar there is just the logo.
export function AppHeader() {
  const [lookupOpen, setLookupOpen] = useState(false)
  const navigate = useNavigate()
  const onHome = useLocation().pathname === '/'
  return (
    <div style={{ background: '#fff', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '12px var(--sp-5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <img src="/nuforce-logo.png" alt="NUForce by NU Laboratories" style={{ height: 34, width: 'auto', display: 'block' }} />
          {!onHome && (
            <button
              onClick={() => navigate('/')}
              title="Go to the home screen"
              style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: '#fff', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '7px 15px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 7L7.5 2.5L13 7M3.4 5.9V12.5H11.6V5.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Home
            </button>
          )}
        </div>
        {!onHome && (
          <button
            onClick={() => setLookupOpen(true)}
            title="Look up a customer account in Customer View (no financials on screen)"
            style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--accent)', background: '#fff', border: '1px solid var(--accent)', borderRadius: 20, padding: '7px 15px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="4.4" stroke="currentColor" strokeWidth="1.6" /><path d="M9.4 9.4L12.5 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            Customer Lookup
          </button>
        )}
      </div>
      {lookupOpen && <CustomerLookup onClose={() => setLookupOpen(false)} />}
    </div>
  )
}

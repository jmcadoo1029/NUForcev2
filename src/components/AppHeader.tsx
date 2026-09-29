import { useNavigate, useLocation } from 'react-router-dom'

// App-level brand bar — the NUForce logo on a surface strip above every screen.
// Two logo files are rendered and CSS shows the one matching the active theme
// (light art on the light bar, dark art on the Ink bar); the swap is driven by the
// same data-theme / prefers-color-scheme rules as the tokens, so it flips instantly
// when the theme toggle changes — no reload or re-render needed.
// A Home button (hidden on the home screen itself, where it'd be redundant) returns
// to the launcher. Customer Lookup lives on the home launcher and as a dashboard
// tab — not in this bar — so it never rides along onto a quote or account page.
export function AppHeader() {
  const navigate = useNavigate()
  const onHome = useLocation().pathname === '/'
  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '12px var(--sp-5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <img className="app-logo app-logo-light" src="/nuforce-logo.png" alt="NUForce by NU Laboratories" style={{ height: 34, width: 'auto' }} />
          <img className="app-logo app-logo-dark" src="/nuforce-logo-dark.png" alt="NUForce by NU Laboratories" style={{ height: 34, width: 'auto' }} />
          {!onHome && (
            <button
              onClick={() => navigate('/')}
              title="Go to the home screen"
              style={{ fontFamily: 'inherit', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '7px 15px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 7L7.5 2.5L13 7M3.4 5.9V12.5H11.6V5.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Home
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

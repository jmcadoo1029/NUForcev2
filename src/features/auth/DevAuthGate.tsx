import { useEffect, useState, type ReactNode } from 'react'
import { getAccessToken, getSessionEmail, isLocalDev, seedDevSession } from '../../lib/auth'
import { WORKSPACE_URL } from '../../lib/config'
import { Button, Card, CardLabel } from '../../components'

// Gate that ensures a live session before rendering the app.
//
// - Deployed (*.nulabs.com): the shared cookie session is present; renders
//   straight through (and bounces to Workspace if it's ever missing).
// - Localhost: shows a paste box to seed your current session into localStorage.
//
// The token is re-checked on every render, on a timer, and on window focus, so
// when it expires (Supabase tokens last ~1h) the paste box comes back on its own
// instead of leaving a broken, error-filled screen.
export function DevAuthGate({ children }: { children: ReactNode }) {
  const [, setTick] = useState(0)
  const [raw, setRaw] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000)
    const onFocus = () => setTick((t) => t + 1)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const token = getAccessToken()
  if (token) return <>{children}</>

  // Production with no session → bounce to Workspace login (Classic behavior).
  if (!isLocalDev()) {
    const ret = encodeURIComponent(window.location.origin)
    window.location.replace(`${WORKSPACE_URL}/?return_to=${ret}`)
    return null
  }

  const handleSeed = () => {
    setErr('')
    const ok = seedDevSession(raw.trim())
    if (!ok) {
      setErr('That didn’t look like a valid session. Paste the full value of the sb-…-auth-token cookie.')
      return
    }
    setRaw('')
    setTick((t) => t + 1) // re-render → token is now valid → render the app
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--sp-7) var(--sp-5)' }}>
      <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, letterSpacing: '-.02em', marginBottom: 'var(--sp-2)' }}>
        Session needed — read-only
      </div>
      <p style={{ color: 'var(--muted)', marginBottom: 'var(--sp-5)' }}>
        Your local session is missing or expired. Supabase tokens last about an hour, so you&rsquo;ll re-paste
        occasionally. It stays in this browser and is used only to read &mdash; nothing is written back.
      </p>

      <Card style={{ marginBottom: 'var(--sp-4)' }}>
        <CardLabel>How to get a fresh token</CardLabel>
        <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text)', lineHeight: 1.7 }}>
          <li>In another tab, open <b>nuforce.nulabs.com</b> and make sure you&rsquo;re logged in.</li>
          <li>Press <b>F12</b> &rarr; <b>Application</b> &rarr; <b>Cookies</b> &rarr; nuforce.nulabs.com.</li>
          <li>
            Find <code>sb-swuuxzmgmldvvomsgmjf-auth-token</code>, copy its full <b>Value</b> (double-click the cell,
            Ctrl+A, Ctrl+C), and paste it below.
          </li>
        </ol>
      </Card>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Paste the session value here…"
        rows={5}
        style={{
          width: '100%',
          fontFamily: 'monospace',
          fontSize: 'var(--fs-sm)',
          padding: 'var(--sp-3)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-sm)',
          resize: 'vertical',
        }}
      />
      {err && <div style={{ color: 'var(--accent)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-2)' }}>{err}</div>}
      <div style={{ marginTop: 'var(--sp-3)' }}>
        <Button onClick={handleSeed} disabled={!raw.trim()}>
          Load my data (read-only)
        </Button>
      </div>
      <p style={{ color: 'var(--dim)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-4)' }}>
        {getSessionEmail() ? `Last signed in as ${getSessionEmail()}.` : 'Keep this token to yourself — it grants access as you. Paste it only here.'}
      </p>
    </div>
  )
}

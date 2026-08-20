// App-level brand bar — the NUForce logo on a white strip above every screen.
// The logo art has a near-white background, so a white bar makes it sit cleanly.
export function AppHeader() {
  return (
    <div style={{ background: '#fff', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '12px var(--sp-5)', display: 'flex', alignItems: 'center' }}>
        <img src="/nuforce-logo.png" alt="NUForce by NU Laboratories" style={{ height: 34, width: 'auto', display: 'block' }} />
      </div>
    </div>
  )
}

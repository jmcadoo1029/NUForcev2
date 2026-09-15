import { Modal } from '../../components'

// Host the classic Spec Builder in a modal instead of a new browser tab. The page
// is a self-contained static tool (public/classic-spec-builder.html): it reads its
// input from the URL query + localStorage payload the launcher writes, and its
// output is a downloadable Word doc / print — it doesn't push anything back into the
// app, so an iframe is a straight drop-in for the old window.open. Same-origin, so
// the iframe reads the same localStorage and its downloads/print work normally.
export function SpecBuilderModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <Modal title="Spec Builder" onClose={onClose} width={1180}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--sp-2)' }}>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 'var(--fs-caption)', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
          title="If a download or print is blocked inside the window, open the tool in its own tab"
        >
          Open in a new tab ↗
        </a>
      </div>
      <iframe
        src={src}
        title="Spec Builder"
        style={{ width: '100%', height: '78vh', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff', display: 'block' }}
      />
    </Modal>
  )
}

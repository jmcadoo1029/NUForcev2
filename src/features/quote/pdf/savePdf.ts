import type { jsPDF } from 'jspdf'

// Save a jsPDF doc, preferring the native Save As dialog (File System Access API)
// and falling back to an auto-download. Ported verbatim from Classic.
export async function savePdfAs(doc: jsPDF, suggestedName: string): Promise<void> {
  const blob = doc.output('blob')
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<any> }
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'PDF File', accept: { 'application/pdf': ['.pdf'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (e: any) {
      if (e && e.name === 'AbortError') return // user cancelled
      // fall through to legacy download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Send a jsPDF doc straight to the printer's print dialog instead of saving. Loads
// the PDF into a hidden iframe and calls print() on it (works in Chrome/Edge, which
// is what the team runs); autoPrint + a new-tab open are the fallbacks so the print
// dialog still comes up if the iframe route is blocked. Nothing is downloaded.
export function printPdf(doc: jsPDF): void {
  try { (doc as unknown as { autoPrint?: () => void }).autoPrint?.() } catch { /* older jsPDF — ignore */ }
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.src = url
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      window.open(url, '_blank') // fallback: open in a tab; autoPrint triggers the dialog there
    }
    // Give the print dialog time to grab the document before cleanup.
    setTimeout(() => { URL.revokeObjectURL(url); iframe.remove() }, 60000)
  }
  document.body.appendChild(iframe)
}

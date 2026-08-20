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

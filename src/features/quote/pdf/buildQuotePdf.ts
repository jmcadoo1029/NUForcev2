import { jsPDF } from 'jspdf'
import { savePdfAs } from './savePdf'
import { NU_LOGO_PDF, JORDAN_SIG_PDF } from './assets'

// Quote + Budget PDF, ported from Classic's buildPDF so output matches Classic
// exactly (Letter, jsPDF 2.5.1, manual drawing — no autotable). Differences from
// Classic, all deliberate:
//   • Line items render from V2's unified, pre-ordered `lines` list (Classic
//     merged auto/picker pools + lineOrder/unifiedOrder; V2 already did that).
//   • Line-item ROW HEIGHT is dynamic: the item label and its description wrap
//     and the row grows to fit, instead of Classic's fixed 26pt row that forced
//     descriptions to be truncated.
//   • Specs/notes read straight from the quote (no isDirty/snapshot freeze).

export interface PdfLine { code?: string | null; label: string; desc?: string; price: number; qty?: number }
export interface PdfBudget {
  on?: boolean
  rows?: { desc?: string; qty?: string | number; unitCost?: string | number }[]
  markup?: string | number
  notes?: string
}
export interface QuotePdfInput {
  qi: Record<string, any>
  ti: Record<string, any>
  lines: PdfLine[]
  budget?: PdfBudget
  budgetOnly?: boolean
  /**
   * 'save' (default) triggers a browser download, matching Classic. 'return'
   * skips the download and hands back the rendered bytes + filename instead, so
   * the same exact PDF can be attached to a send and/or uploaded to Storage.
   */
  output?: 'save' | 'return'
}

export interface QuotePdfBytes { blob: Blob; fileName: string; mime: 'application/pdf' }

type RGB = [number, number, number]

export async function buildQuotePdf({ qi, ti, lines, budget, budgetOnly = false, output = 'save' }: QuotePdfInput): Promise<QuotePdfBytes | void> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const PW = doc.internal.pageSize.getWidth() // 612
  const PH = doc.internal.pageSize.getHeight() // 792
  const ML = 54
  const MR = 54
  const TW = PW - ML - MR
  const RED: RGB = [192, 57, 43]
  const DARK: RGB = [30, 30, 30]
  const MUTED: RGB = [100, 100, 100]
  const LIGHT: RGB = [240, 240, 240]
  let y = 44
  let pageNum = 1
  // The date printed on the quote is the day the PDF is generated (so a re-generated
  // or revised quote always carries the current date), not a stored/stale field.
  const genDate = new Date().toLocaleDateString('en-US')

  const sf2 = (v: unknown) => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? 0 : n }
  const money = (v: unknown) => '$' + Math.round(sf2(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  let curFont = { style: 'normal', size: 9, color: DARK as number[] }
  const setF = (style: string, size: number, color?: number[]) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(...((color || DARK) as RGB))
    curFont = { style, size, color: color || DARK }
  }

  const drawFooter = () => {
    const p = (doc.internal as any).getCurrentPageInfo().pageNumber
    const prev = curFont
    setF('normal', 8, MUTED)
    doc.text('NU Laboratories, Inc. | ' + (qi.opp || ''), ML, PH - 18)
    doc.text('Page ' + p + ' | ' + genDate, PW - MR, PH - 18, { align: 'right' })
    doc.setDrawColor(...LIGHT)
    doc.setLineWidth(0.5)
    doc.line(ML, PH - 26, PW - MR, PH - 26)
    setF(prev.style, prev.size, prev.color)
  }

  const checkY = (need?: number) => {
    if (y + (need || 20) > PH - 52) {
      drawFooter()
      doc.addPage()
      pageNum++
      y = 54
    }
  }

  const kvRow = (label: string, value: unknown) => {
    if (!value && value !== 0) return
    checkY(16)
    setF('bold', 9.5, DARK)
    doc.text(String(label), ML, y)
    setF('normal', 9.5, DARK)
    const vlines = doc.splitTextToSize(String(value), TW - 120)
    doc.text(vlines, ML + 120, y)
    y += Math.max(14, vlines.length * 13)
  }

  const sectionHdr = (title: string) => {
    checkY(30)
    y += 10
    doc.setFillColor(...LIGHT)
    doc.rect(ML, y - 10, TW, 20, 'F')
    doc.setFillColor(...RED)
    doc.rect(ML, y - 10, 3, 20, 'F')
    setF('bold', 9, RED)
    doc.text(title.toUpperCase(), ML + 10, y + 4)
    y += 16
  }

  // ── PAGE 1 (quote only) ────────────────────────────────────────────────────
  if (!budgetOnly) {
    try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40) } catch { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y + 28) }
    setF('normal', 8.5, DARK)
    ;['312 Old Allerton Road', 'Annandale, NJ 08801-3206', 'Tel: 908-713-9300 | Fax: 908-713-9001', 'sales@nulabs.com']
      .forEach((l, i) => doc.text(l, PW - MR, y + 14 + i * 11, { align: 'right' }))
    y += 54

    doc.setDrawColor(...RED)
    doc.setLineWidth(1.5)
    doc.line(ML, y, PW - MR, y)
    y += 16

    setF('bold', 16, DARK)
    doc.text('Quote #' + (qi.opp || ''), ML, y)
    setF('normal', 10, MUTED)
    doc.text('Date: ' + genDate, PW - MR, y, { align: 'right' })
    y += 24

    // ── QUOTE INFORMATION ────────────────────────────────────────────────────
    sectionHdr('Quote Information')
    y += 4
    const colW = TW / 2
    const labelW = 60
    const leftLabelX = ML
    const leftValueX = ML + labelW
    const rightLabelX = ML + colW
    const rightValueX = ML + colW + labelW
    const leftCol = [
      ['Opportunity', qi.opp],
      ['Stage', qi.stage],
      ['Type', qi.type],
      ['Date', genDate],
      ['RFQ', qi.rfq],
    ].filter((r) => r[1])
    const rightCol = [
      ['Account', qi.account],
      ['Address', qi.billTo],
      ['', qi.billToCity],
      ['Contact', qi.contact],
      ['Email', qi.email],
    ].filter((r) => r[1])
    const lineH = 11
    const rowGap = 2
    const valueW = colW - labelW - 8
    const measureColH = (col: any[][]) => {
      setF('normal', 9.5, DARK)
      return col.reduce((h, r) => h + doc.splitTextToSize(String(r[1]), valueW).length * lineH + rowGap, 0)
    }
    const blockH = Math.max(measureColH(leftCol), measureColH(rightCol))
    checkY(blockH + 4)
    const startY = y
    const renderCol = (col: any[][], labelX: number, valueX: number) => {
      let cy = startY
      col.forEach((r) => {
        setF('normal', 9.5, DARK)
        const vlines = doc.splitTextToSize(String(r[1]), valueW)
        if (r[0]) {
          setF('bold', 9.5, DARK)
          doc.text(String(r[0]), labelX, cy)
          setF('normal', 9.5, DARK)
        }
        doc.text(vlines, valueX, cy)
        cy += vlines.length * lineH + rowGap
      })
    }
    renderCol(leftCol, leftLabelX, leftValueX)
    renderCol(rightCol, rightLabelX, rightValueX)
    y = startY + blockH + 4
    y += 6

    // ── TEST ITEM DESCRIPTION ─────────────────────────────────────────────────
    sectionHdr('Test Item Description')
    y += 4
    const sizeStr = [ti.dimL && ti.dimL + '"', ti.dimW && ti.dimW + '"', ti.dimH && ti.dimH + '"'].filter(Boolean).join(' x ')
    const pwrParts = [ti.volt && ti.volt + ' V ' + (ti.pwrType || 'AC'), ti.phase && ti.phase + ' Ph', ti.hz && ti.hz + ' Hz', ti.amps && ti.amps + ' A'].filter(Boolean)
    ;([
      ti.item && ['Test Item', ti.item],
      ti.qty && ti.qty !== '1' && ['Qty', ti.qty],
      ti.model && ['Model No.', ti.model],
      ti.drawing && ['Drawing No.', ti.drawing],
      sizeStr && ['Size', sizeStr],
      ti.wt && ['Weight', ti.wt + ' lbs'],
      pwrParts.length && ['Power', pwrParts.join(', ')],
      (ti.loads !== '' && (ti.loads != null || qi.account)) && ['Loads', ti.loads != null && ti.loads !== '' ? ti.loads : (qi.account ? 'All electrical and/or resistive loads will be provided by ' + qi.account + ' unless otherwise discussed.' : '')],
      ti.mounting && ['Mounting', ti.mounting],
      ti.pressureFlow && ['Pressure/Flow', ti.pressureFlow],
    ] as any[]).filter(Boolean).filter((r) => r[1]).forEach(([l, v]) => kvRow(l, v))

    // GSI bar
    checkY(42)
    y += 6
    doc.setFillColor(232, 236, 240)
    doc.rect(ML, y - 2, TW, 30, 'F')
    setF('bold', 9, DARK)
    const gsiHalf = TW / 2
    doc.text('GSI: ' + (ti.gsi || 'Unknown'), ML + 6, y + 10)
    doc.text('Customer Witness: ' + (ti.witness || 'Unknown'), ML + gsiHalf + 6, y + 10)
    doc.text('Document Restriction: ' + (ti.docRestriction || 'None'), ML + 6, y + 22)
    doc.text('DPAS: ' + (ti.dpas || 'None'), ML + gsiHalf + 6, y + 22)
    y += 34

    // ── SPECIFICATIONS & NOTES ────────────────────────────────────────────────
    const specsText = String(ti.tiSpecs || '').trim()
    const notesText = String(ti.tiNotes || '').trim()
    const renderNoteLines = (text: string) => {
      text.split('\n').forEach((rawLine) => {
        const line = rawLine.replace(/\r$/, '')
        if (!line.trim()) { y += 4; return }
        const sub = /^(\s{2,}|\t)/.test(line)
        const baseIndent = sub ? 20 : 8
        const m = line.match(/^\s*[•\-*◦·]\s+(.*)$/)
        if (m) {
          const textX = ML + baseIndent + 10
          const w = doc.splitTextToSize(m[1], TW - (baseIndent + 10) - 6)
          checkY(w.length * 12 + 2)
          doc.setFillColor(...DARK)
          doc.circle(ML + baseIndent + 3, y - 2.5, 1.3, 'F')
          doc.text(w, textX, y)
          y += w.length * 12 + 2
        } else {
          const w = doc.splitTextToSize(line.replace(/^\s+/, ''), TW - baseIndent - 6)
          checkY(w.length * 12 + 2)
          doc.text(w, ML + baseIndent, y)
          y += w.length * 12 + 2
        }
      })
    }
    if (specsText || notesText) {
      sectionHdr('Specifications & Notes')
      y += 4
      if (specsText) {
        setF('bold', 9.5, DARK); checkY(14); doc.text('Specifications:', ML, y); y += 13
        setF('normal', 9, DARK)
        renderNoteLines(specsText)
        y += 4
      }
      if (notesText) {
        setF('bold', 9.5, DARK); checkY(14); doc.text('Notes:', ML, y); y += 13
        setF('normal', 9, DARK)
        renderNoteLines(notesText)
        y += 4
      }
      y += 4
    }

    // ── Intro paragraph ────────────────────────────────────────────────────────
    checkY(44)
    y += 4
    setF('normal', 9, DARK)
    const intro = 'Pursuant to your request, we are pleased to offer the following quotation. All pricing is subject to the attached terms and conditions. Any additional terms and conditions must be clearly defined in writing and may be subject to negotiation. This quote is based on the following:'
    const iw = doc.splitTextToSize(intro, TW)
    checkY(iw.length * 12 + 8)
    doc.text(iw, ML, y); y += iw.length * 12 + 12

    // ── PRICING SUMMARY ────────────────────────────────────────────────────────
    sectionHdr('Pricing Summary')
    y += 4
    const cQty = 28
    const cCode = 36
    const cAmt = 90
    const cDesc = TW - cQty - cCode - cAmt
    const drawTblHdr = () => {
      doc.setFillColor(50, 50, 50)
      doc.rect(ML, y, TW, 16, 'F')
      setF('bold', 8.5, [255, 255, 255])
      doc.text('Qty', ML + cQty / 2, y + 11, { align: 'center' })
      doc.text('Code', ML + cQty + 4, y + 11)
      doc.text('Description', ML + cQty + cCode + 4, y + 11)
      doc.text('Amount', PW - MR - 4, y + 11, { align: 'right' })
      y += 16
    }
    drawTblHdr()

    lines.forEach((l, idx) => {
      const bg: RGB = idx % 2 === 0 ? [255, 255, 255] : [247, 248, 250]
      const label = l.label || ''
      const desc = l.desc && l.desc.trim() ? l.desc.trim() : ''
      setF('normal', 9, DARK)
      const labelLines = doc.splitTextToSize(label, cDesc - 10)
      let descLines: string[] = []
      if (desc) {
        setF('italic', 7.5, [130, 130, 130])
        descLines = doc.splitTextToSize(desc, cDesc - 10)
      }
      const nLabel = labelLines.length
      const nDesc = descLines.length
      // Dynamic height (Classic used a fixed 26pt): matches Classic exactly for a
      // single label + single desc line (26) and no-desc rows (14), and grows to
      // fit when the label or description wraps.
      const rowH = nDesc ? 26 + (nLabel - 1) * 11 + (nDesc - 1) * 9 : 14 + (nLabel - 1) * 11
      if (y + rowH + 2 > PH - 52) { drawFooter(); doc.addPage(); pageNum++; y = 54; drawTblHdr() }
      doc.setFillColor(...bg)
      doc.rect(ML, y, TW, rowH, 'F')
      const q = Math.max(1, Math.round(l.qty || 1))
      setF('normal', 9, DARK)
      doc.text(String(q), ML + cQty / 2, y + 10, { align: 'center' })
      if (l.code) { setF('normal', 8, MUTED); doc.text(String(l.code), ML + cQty + 4, y + 10) }
      setF('normal', 9, DARK)
      doc.text(labelLines, ML + cQty + cCode + 4, y + 10)
      if (nDesc) {
        setF('italic', 7.5, [130, 130, 130])
        const descBaseY = y + 10 + (nLabel - 1) * 11 + 9
        doc.text(descLines, ML + cQty + cCode + 4, descBaseY)
      }
      setF('bold', 9, DARK)
      doc.text(money((l.price || 0) * q), PW - MR - 4, y + 10, { align: 'right' })
      y += rowH
    })

    // Total row
    checkY(28)
    y += 4
    doc.setDrawColor(...RED); doc.setLineWidth(1); doc.line(ML, y, PW - MR, y); y += 1
    doc.setFillColor(245, 245, 245); doc.rect(ML, y, TW, 20, 'F')
    setF('bold', 11, DARK)
    doc.text('TOTAL', ML + cQty + cCode + 4, y + 14)
    const total = lines.reduce((a, l) => a + (l.price || 0) * Math.max(1, Math.round(l.qty || 1)), 0)
    doc.text(money(total), PW - MR - 4, y + 14, { align: 'right' })
    y += 26

    // ── NOTES / TERMS — new page ────────────────────────────────────────────────
    drawFooter()
    doc.addPage()
    y = 54
    doc.setFillColor(...RED); doc.rect(ML, y - 2, TW, 24, 'F')
    setF('bold', 13, [255, 255, 255]); doc.text('NOTES', ML + 10, y + 13); y += 32

    const TERMS = [
      'All work to be performed during normal business hours unless specifically noted on this quote.',
      'Customer is to supply all installation hardware, cables, hoses, mating connections for power or fluid, electrical/resistive and dummy loads, and specialized monitoring equipment/peripheral equipment unless other arrangements with NU Laboratories, Inc. have been made. No functional testing shall be performed by NU Laboratories or its personnel unless specifically addressed in our quotation.',
      'All equipment, including the UUT, support equipment, test fixtures, mounting brackets, etc. are to be delivered to NU Laboratories no later than (5) business days prior to the scheduled testing start date.',
      'Return shipping arrangements are to be provided prior to the start of testing. If not, storage charges will apply beginning (5) business days after testing is completed.',
      'If applicable, all import and export documentation is to be provided by the customer.',
      "Out-of-scope work, including additional efforts and standby charges are to be determined at NU Laboratories' discretion and will be quoted separately.",
      'This quote does not guarantee a specific testing schedule, nor does it represent a fixed number of testing days. Scheduling will be secured with the receipt of a purchase order and/or test procedure approval.',
      'Testing duration may be affected by factors such as equipment malfunctions or failures, delays in the delivery of customer-supplied equipment, or other unforeseen issues. Such circumstances may result in additional charges.',
      'Delays caused by NU Laboratories--including, but not limited to, the unavailability of test equipment or personnel--will not result in charges to the customer. However, such delays will not entitle the customer to any discounts, refunds, or price reductions.',
      "The provided quote is based on a pass scenario and does not account for any additional time required due to test item malfunctions or failures. Should the customer's representative request a retest or engineering evaluation, a separate quote will be issued.",
      'Any requested lead times are estimated and may be subject to change.',
      'This quote is based on a total purchase and is good for a period of 90 days.',
      'All mounting hardware is assumed to be supplied by the customer. If NU Laboratories is asked to supply mounting hardware, it is assumed to be SAE Grade 5. Any other material hardware will be quoted separately and specifically noted within the quote. If no notes pertaining to the type of hardware are present on the quote, the quote reflects Grade 5 hardware. All fixturing provided by NU Laboratories is assumed to be A36 Steel. All other hardware and fixture requirements will be quoted separately if not detailed in this quote.',
    ]
    TERMS.forEach((t, i) => {
      const w = doc.splitTextToSize(t, TW - 20)
      const blockH = w.length * 11 + 5
      checkY(blockH + 3)
      doc.setFillColor(...LIGHT); doc.circle(ML + 7, y + 3, 5, 'F')
      setF('bold', 7, MUTED); doc.text(String(i + 1), ML + 7, y + 6, { align: 'center' })
      setF('normal', 8, DARK); doc.text(w, ML + 18, y + 6)
      y += blockH
    })
    y += 10

    // ── GOVERNMENT SOURCE INSPECTION ────────────────────────────────────────────
    checkY(70)
    doc.setFillColor(...LIGHT); doc.rect(ML, y - 2, TW, 18, 'F')
    doc.setFillColor(...RED); doc.rect(ML, y - 2, 3, 18, 'F')
    setF('bold', 9, RED); doc.text('GOVERNMENT SOURCE INSPECTION', ML + 10, y + 10); y += 26
    setF('normal', 9, DARK)
    doc.text('If Government Source Inspection is required:', ML, y); y += 14
    ;([
      ['Navy Nuclear', 'Naseer Murray -- naseer.t.murray.civ@mail.mil'],
      ['Non-Nuclear', 'Tyson Rounsaville, QAR -- tyson.rounsaville.civ@mail.mil -- T: 973-891-3850  F: 973-446-4236'],
    ] as [string, string][]).forEach(([k, v]) => {
      checkY(18)
      setF('bold', 9, DARK); const kw = doc.getTextWidth('* ' + k + ': ')
      doc.text('* ' + k + ': ', ML + 4, y)
      setF('normal', 9, DARK)
      const vw = doc.splitTextToSize(v, TW - kw - 10)
      doc.text(vw, ML + 4 + kw, y); y += vw.length * 12 + 6
    })
    y += 12

    // ── Closing paragraphs ──────────────────────────────────────────────────────
    const closingParas = [
      'This is a line item quote. Please have your purchase order reflect each line item and our quote number. Please send the signed Terms and Conditions page and Purchase Orders to Fax: 908-713-9001 or e-mail: sales@nulabs.com, attention Jordan McAdoo.',
      'We appreciate this opportunity to quote on your testing requirements. In the event that we receive a purchase order for the above testing, please acknowledge the enclosed terms and conditions and return with your order. Should you have further questions, please feel free to contact us.',
    ]
    setF('normal', 9, DARK)
    closingParas.forEach((t) => {
      const w = doc.splitTextToSize(t, TW)
      checkY(w.length * 12 + 10)
      doc.text(w, ML, y); y += w.length * 12 + 10
    })

    // ── Signature block ─────────────────────────────────────────────────────────
    checkY(90); y += 16
    setF('normal', 8.5, MUTED); doc.text('Submitted by:', ML, y); y += 6
    try { doc.addImage(JORDAN_SIG_PDF, 'PNG', ML, y, 140, 66) } catch { setF('italic', 18, DARK); doc.text('Jordan McAdoo', ML, y + 40) }
    y += 70
    setF('bold', 9, DARK); doc.text('Jordan McAdoo', ML, y); y += 13
    setF('normal', 8.5, MUTED); doc.text('Sales Manager, NU Laboratories, Inc.', ML, y)
  }

  // ── BUDGET PDF ──────────────────────────────────────────────────────────────
  if (budgetOnly && budget?.on && budget.rows && budget.rows.length > 0) {
    try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40) } catch { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y + 28) }
    setF('normal', 8.5, DARK)
    ;['312 Old Allerton Road', 'Annandale, NJ 08801-3206', 'Tel: 908-713-9300 | Fax: 908-713-9001', 'sales@nulabs.com']
      .forEach((l, i) => doc.text(l, PW - MR, y + 14 + i * 11, { align: 'right' }))
    y += 54
    doc.setDrawColor(...RED); doc.setLineWidth(1.5); doc.line(ML, y, PW - MR, y); y += 16
    setF('bold', 16, RED); doc.text('BUDGET MATERIALS', ML, y); y += 4
    setF('normal', 9, MUTED); doc.text('Date: ' + genDate, PW - MR, y - 10, { align: 'right' })
    if (qi.opp) { setF('normal', 9, DARK); doc.text('Opportunity: ', ML, y + 6); setF('bold', 9, DARK); doc.text(qi.opp, ML + 55, y + 6); y += 20 } else { y += 14 }

    const bNotes = String(budget.notes || '').trim()
    if (bNotes) {
      checkY(20); setF('bold', 8.5, DARK); doc.text('Internal Notes:', ML, y); y += 11
      setF('normal', 8.5, [80, 80, 80])
      bNotes.split('\n').forEach((line) => { if (!line.trim()) { y += 4; return } const w = doc.splitTextToSize(line, TW - 6); checkY(w.length * 11 + 2); doc.text(w, ML + 4, y); y += w.length * 11 + 2 })
      y += 8
    }
    y += 6
    const mp = sf2(budget.markup ?? 25) / 100
    const hardTot = budget.rows.reduce((s, r) => s + sf2(r.qty ?? 1) * sf2(r.unitCost ?? 0), 0)
    doc.setFillColor(50, 50, 50); doc.rect(ML, y, TW, 16, 'F')
    setF('bold', 8.5, [255, 255, 255])
    const bDesc = TW * 0.44
    const bQty = TW * 0.08
    const bUC = TW * 0.16
    const bHC = TW * 0.16
    let bx = ML
    doc.text('Part / Description', bx + 4, y + 11); bx += bDesc
    doc.text('Qty', bx + bQty / 2, y + 11, { align: 'center' }); bx += bQty
    doc.text('Unit Cost', bx + 4, y + 11); bx += bUC
    doc.text('Hard Cost', bx + 4, y + 11); bx += bHC
    doc.text('w/ Markup', bx + 4, y + 11)
    y += 16
    budget.rows.forEach((r, idx) => {
      checkY(14)
      doc.setFillColor(...((idx % 2 === 0 ? [255, 255, 255] : [247, 248, 250]) as RGB))
      doc.rect(ML, y, TW, 14, 'F')
      setF('normal', 8.5, DARK)
      bx = ML
      const hardCost = sf2(r.qty ?? 1) * sf2(r.unitCost ?? 0)
      const markedUp = Math.round(hardCost * (1 + mp))
      const dw = doc.splitTextToSize(r.desc || '', bDesc - 8)
      doc.text(dw, bx + 4, y + 10); bx += bDesc
      doc.text(String(r.qty ?? '1'), bx + bQty / 2, y + 10, { align: 'center' }); bx += bQty
      doc.text('$' + sf2(r.unitCost ?? 0).toLocaleString(), bx + 4, y + 10); bx += bUC
      setF('bold', 8.5, DARK); doc.text('$' + Math.round(hardCost).toLocaleString(), bx + 4, y + 10); bx += bHC
      setF('bold', 8.5, RED); doc.text('$' + markedUp.toLocaleString(), bx + 4, y + 10)
      y += Math.max(14, dw.length * 11 + 3)
    })
    checkY(18)
    doc.setFillColor(232, 236, 240); doc.rect(ML, y, TW, 16, 'F')
    doc.setDrawColor(...RED); doc.setLineWidth(0.5); doc.line(ML, y, PW - MR, y)
    setF('bold', 8.5, DARK)
    bx = ML + bDesc + bQty
    doc.text('Markup: ' + Math.round(sf2(budget.markup ?? 25)) + '%', bx + 4, y + 11)
    bx += bUC
    doc.text('$' + Math.round(hardTot).toLocaleString(), bx + 4, y + 11)
    bx += bHC
    setF('bold', 8.5, RED); doc.text('$' + Math.round(hardTot * (1 + mp)).toLocaleString(), bx + 4, y + 11)
    y += 22
  }

  const tp = (doc.internal as any).getNumberOfPages()
  for (let p = 1; p <= tp; p++) { doc.setPage(p); drawFooter() }

  // "26-123 Quote.pdf" / "26-123 Budget.pdf"; falls back to "Quote.pdf" if no number.
  const fname = (qi.opp || 'Quote') + (budgetOnly ? ' Budget' : (qi.opp ? ' Quote' : '')) + '.pdf'
  if (output === 'return') {
    const blob = doc.output('blob') as Blob
    return { blob, fileName: fname, mime: 'application/pdf' }
  }
  await savePdfAs(doc, fname)
}

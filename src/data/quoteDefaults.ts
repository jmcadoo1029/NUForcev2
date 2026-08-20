// Quote-form defaults, dropdown option lists, and the shared row/line types.
// Extracted from QuotePage so the form section components and the page share one
// definition of the quote's field shape (which mirrors Classic exactly, keeping
// the calculator's size/weight/power links intact).

export interface RelatedContact { name: string; title: string; email: string; phone: string }
export interface BudgetRow { desc: string; qty: string; unitCost: string }
export interface LineItem { key: number; code: string; label: string; desc: string; price: number; added: boolean }

// Test Item field defaults — the exact Classic ti shape.
export const TI_DEFAULTS: Record<string, any> = {
  item: '', qty: '1', model: '', drawing: '', loads: null,
  dimL: '', dimW: '', dimH: '', wt: '', volt: '', pwrType: 'AC',
  phase: '', hz: '', inrush: '', amps: '', mounting: '', pressureFlow: '',
  gsi: 'Unknown', witness: 'Unknown', docRestriction: 'None', dpas: '',
  tiSpecs: '', tiNotes: '',
}

// Quote Info field defaults.
export const QI_DEFAULTS: Record<string, any> = {
  opp: '', account: '', billTo: '', billToCity: '', contact: '', email: '',
  prepby: '', rev: '', revDate: '', date: '', rfq: '', stage: 'Proposal/Price Quote',
  type: 'New Business', relatedOpps: '', relatedContacts: [],
}

// Setup Details defaults (Classic setup shape).
export const SETUP_FORM_DEFAULTS: Record<string, any> = { techRate: '175', fabHours: '4', holes: '0', cables: '0', drillTap: false }

// Dropdown option lists (Classic's Quote Info + Test Item forms).
export const TYPE_OPTS = ['New Business', 'Existing Business']
export const STAGE_OPTS = ['Proposal/Price Quote', 'Budgetary', 'Closed Won', 'Closed Lost', 'Other']
export const GSI_OPTS = ['Unknown', 'Yes', 'No']
export const DOC_OPTS = ['None', 'ITAR', 'CUI/Other', 'NOFORN', 'Dist Statement B/C/D/E']

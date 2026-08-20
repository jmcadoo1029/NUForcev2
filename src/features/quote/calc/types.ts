// Per-tab state shapes for the Pricing Calculator. The parent owns all tab state
// (so the EMI/PQ/DCM selections stay reachable by the Spec Builder); each tab
// component receives its slice + setter as controlled props.

// What the calculator hands to the Product Picker: catalog item keys with a
// suggested price override, so it lands on the recognized line item.
export interface CalcSelection { key: string; price: number }
// Custom lines (no catalog item, e.g. Overtime) handed to the picker's custom rows.
export interface CalcCustom { code: string; label: string; desc?: string; price: number }
// A raw budget row ported one-way into the quote's Budget list (markup applied there).
export interface CalcBudgetRow { desc: string; qty: string; unitCost: string }

export interface VibState { std: string; testing: string; pia: string; spec: string; freqRange: string }
export interface ShockState { cat: string; std: string; wt: string; fromVib: boolean; pia: string; lwTesting: string }
export interface NoiseState { chamber: string; level: string; durVal: string; durUnit: string; pia: string; spec: string }
export interface EnvState { type: string; thDur: string; altDwell: string; spec: string }
export interface HfvState { std: string; dur: string; pia: string; spec: string }
export interface ShoState { std: string; testing: string; hfvDisc: boolean; pia: string; shape: string; spec: string }
export interface StdState { std: string; testing: string; pia: string; spec: string } // Airborne / Structureborne
export type InstrState = Record<string, any>
export interface PqState { rate: string; setupShifts: string; tdShifts: string; pia: string; rows: Record<string, boolean>; spec: string }
export interface DcmState { rate: string; setupShifts: string; testShifts: string; pia: string; spec: string; include: boolean }
export interface EmiState { revF: boolean; revG: boolean; rate: string; setupShifts: string; tdShifts: string; pia: string; tests: Record<string, boolean>; plats: Record<string, boolean>; locs: Record<string, boolean>; spec: string }
export interface EmiBudgetState { rs103On: boolean; rs103Amt: string; v440On: boolean; v440Amt: string }
export interface OtRatesState { wkBase: string; wkRate: string; weBase: string; weRate: string }
export interface OtRow { key: number; type: string; techs: string; hours: string }
export interface PqExpandState { p1: boolean; b3: boolean }

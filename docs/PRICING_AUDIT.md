# Pricing Calculator — Classic audit (pre-Phase 4)

Audit of Classic `App.jsx` to map how pricing works before rebuilding it in V2.
Line numbers reference the Classic file. This is the reference for the Phase 4
build.

---

## The single most important finding: there are TWO pricing engines

Classic has two independent price paths, and they do not share code or always
agree:

1. **`calcSummary()` (L3441–3849) — the source of truth.** Prices the actual
   quote from the per-section state (`vibs`, `shocks`, `emis`, …), assembles the
   line items, and produces the total. This is what saves, prints, and drives
   `displayTotal`.
2. **The "smart" estimator / Product Picker `PRODUCTS` table (L8324+, L9499+) —
   suggest-only.** Its own scalar state and a flat price table. Produces
   *suggested* numbers and never touches the quote total.

The Product Picker we already built in V2 is the *estimator* style (a flat
catalog you add from). The **real quote math is the section calculator feeding
`calcSummary`.** Phase 4 is primarily about porting `calcSummary` and the
section forms — the catalog picker is a convenience layer on top.

**Decision needed:** keep both (catalog picker for quick adds + section
calculator for real pricing), and make them share ONE set of price constants so
they can't drift. Classic's two MW-shock tables already disagree (see
Inconsistencies).

---

## Shared constants / helpers (Classic L4–83)

```
NOISE_BASE_30 / NOISE_BASE_60   noise testing base by dB (30s / 60s)
NOISE_FAC        Speakerbox 1000 · 64 Reverb 1500 · 300 Reverb 2000 · Prog Wave Tube 2750
ENV_TH_PRICES    "0 to 1 Day":1000, "3 Days":1350, "5 Days":1875, "7 Days":2275, "10 Days":2950
PROC_BASE 1600 · REPORT_BASE 950
EMI_SR 1600 · PQ_SR 1450 · DCM_SR 1600      (shift-rate defaults; per-instance rate overrides)
r25(n)  = round to nearest $25          (applied at add() time)
sf(v,d) = safe float parse with default
mwDisc / lwDisc   from-vib setup discount tables
mwTesting(wt)     4575 (<=2500) · 5575 (<=3500) · 6250 (>3500)   MW weight-based testing
```

Global setup state: `setup = {techRate:"175", fabHours:"4", holes:"0", cables:"0", drillTap:false}`.

### `sectionSetup()` — every "Setup" line (L3403)

```
std   = s.stdSetup (per-section base)
drill = holes × 0.5hr × techRate × (drillTap ? 1.5 : 1)
fab   = fabHours × techRate
addl  = s.addlCosts
Setup = round(std + drill + fab + addl)
```

Drill/fab come from the ONE global `setup`; only `stdSetup`/`addlCosts` are
per-section. (Noise is the exception — its setup uses the chamber base, not
global drill/fab.)

---

## Test Item field → pricing links (what must be preserved)

There is **no text parser** — `ti` fields ARE the structured inputs. Calculators
read `ti.*` as fallback defaults (`local || ti?.field`). The money-critical
links:

| ti field | Drives | Where |
|---|---|---|
| `wt` | MW-shock testing tier (4575/5575/6250); EMI setup weight multiplier (+10% ≥800lb, +20% ≥1500lb); Picker `mws_test` band | L83, L8503, L9495 |
| `dimL/W/H` | EMI radiated shift counts; noise chamber fit/recommendation | L876, L8714 |
| `phase` | EMI conducted-test shift counts; PQ 3-phase shift overrides | L8484, L3590 |
| `volt` + `pwrType` | 440VAC power-source flag ($6,500) for CE101/102; PQ warning | L8484, L9180 |
| `amps`, `hz` | Test applicability / grey-out (indirect $ — removes billable tests) | L1071, L1624 |
| `inrush` | **nothing** — inert input | — |
| `qty` | **nothing** in pricing — display only | — |

- `tiSpecs`/`tiNotes` are auto-appended from the *selected tests* (guarded by
  user-edit refs), then editable. This is the only true derivation.
- **Rebuild rule:** preserve the `local || ti?.x` fallback and the weight→price
  auto-set. V2 already stores `ti` in Classic's exact shape, so these links
  bind cleanly.

---

## Section inventory (what to build)

Mechanical / environmental (flat-price sections):

| Section | Form | State | Setup base | Testing base |
|---|---|---|---|---|
| Vibration | VibForm L480 | vibs | 900 | 3250 (+2500 circ, +500 hydro ea) |
| Shock (MW/LW) | ShockForm L543 | shocks | 1500 / 900 | mwTesting(wt) / 1450 |
| Noise | NoiseForm L636 | noises | chamber base | noiseTestingPrice() by dB/dur |
| Airborne | AbForm L1848 | abs | 1000 | 2850 |
| Structureborne | SbForm L1881 | sbs | 850 | 2650 |
| Environmental | EnvForm L773 | envs | per-item table | per-item (T&H by duration) |
| HF Vibration | HfvForm L1682 | hfvs | 500 | hfvTestingPrice(dur) |
| Shock (Other) | ShoForm L1734 | shos | 500 (−25% if HFV on) | 1250 |
| Instrumentation | InstForm L1771 | inst | — | per-channel: Shock 525, CM-Shock 350, Vib 325, CM-Vibe 750, HSV 1950 |

Shift-based (the "bulky" sections):

| Section | Form | Rate | Pricing |
|---|---|---|---|
| EMI | EmiForm L1057 | 1600 | Setup 3 sh · Testing Σ(per-test shifts)×rate (+RS103 $5000) · Teardown 1 sh |
| Power Quality | PqForm L1475 | 1450 | Setup 1.5 sh · Testing Σ(row shifts, 3φ-aware)×rate · Teardown 1 sh |
| DC Magnetics | DcmForm L1665 | 1600 | Setup 1.5 sh · Testing 2 sh (no per-test list) |

Add-ons: CoC $250 · Subcontract (rows) · Teardown (auto, L3670) · Overtime ·
Custom lines · Procedures/Reports (combine +7.5%/extra section) · Modal Analysis
$6750 · Fixture Drawings $2950 · Budget (tracking only).

Environmental per-item price table (setup / testing / teardown):

```
Temp&Humidity 500/1000(→duration)/500 · Salt Fog 0/1750/500 · Altitude 500/1000/500
ESS 0/1000/500 · Acceleration 2000/1950/750 · Inclination 1250/1750/500
Rapid Decomp 1000/2275/500 · Explosive Decomp 1250/2450/500
Drip 500/750/300 · Submergence 500/750/300 · Spray 1250/1250/500
Insulation Resistance 0/500/0
```

---

## Line-item assembly & totals (`calcSummary`)

- `add(label, val, _, code)` → pushes `{label, val, code, unit, seq}`; `r25`
  rounds to $25; **$0 lines are dropped** (`addUser` keeps them, for custom).
  Note the price field is **`val`**, not `price`.
- Display order (L3805): **procedures → mechanical → Teardown → shift lines
  (EMI/PQ/DCM, code 51) → reports.** Procs/reports sub-ordered general→EMI→DCM→PQ.
- `lineOverrides = {idx:{price,desc,deleted}}` — per-line edits, applied in
  `liveTotal`, the Workspace export, and the PDF identically.
- `lineOrder` / `unifiedOrder` — UI reordering + merging auto lines with
  `pickerLines`; `null` = default.
- **`displayTotal`** = frozen `snapshot.total` when clean, else `liveTotal`
  (= override-adjusted summary + pickerLines). PickerLines are merged only at
  total/display time — the summary's own `total` excludes them.

---

## Overtime — make base + tech rate editable (user request)

Two hard-coded copies of the same formula:

```
total = base + techs × hours × rate
Weekday: base 300, rate 262.50   |   Weekend: base 825, rate 350
```

Locations: `calcSummary` L3712 (the one that hits the quote), estimator
`calcOtRow` L8398, hint string L9339. **To make editable:** lift the four
literals (300/825/262.5/350) into state with those defaults and thread through
both formulas + the hint. `techs`/`hours` are already per-row inputs.

---

## EMI / PQ / DCM — "bulky" and the de-bulk plan

Why bulky: EMI renders ~11 per-test toggle rows, each with a computed shift
count, an editable per-test shift override, an expandable breakdown table,
grey-out/warning banners, and inline budget inputs. PQ renders two 11-row tables.
DCM is simple (two shift inputs).

- Shift counts: EMI via `calcEmiShifts()` (L876–1055) — physics model over dims
  (cm), cables, phases, Rev F/G. PQ via inline `PQ_ALL_SH` table with 3-phase
  overrides. Both are large but self-contained.
- Rates are already per-instance editable (`s.rate`).
- **De-bulk approach (progressive disclosure):** collapse each section to a
  summary row (section, # tests, shifts, price) that expands to the full test
  grid on demand; keep the shift math intact underneath.

### EMI budget add-ons (user request: send raw to budget list)

- **RS103 amplifier — $5,000** (`s.rs103amp`). In Classic this is folded into
  the EMI Testing line and DOES hit the total (L3576).
- **440VAC power source — $6,500** (`s.ce101pwrSrc`, when unit ≥440V AC + CE101/
  102). **Bug in Classic:** it's only in the calculator's *suggested* total, not
  in `calcSummary` — so it never reaches the quote total unless added manually.

User's intent for V2: a pre-checked toggle for these that adds the **raw** number
to the **budget list** (budget applies its own 25% markup), persisted per quote.
So in V2 both RS103 and the 440V source become budget-add toggles sending raw
cost — fixing the 440V omission in the process.

---

## Budget section

`budget = {on, rows:[{desc, qty, unitCost}], markup:"25"}`. Markup default 25%,
**display/internal-PDF only** — never added to the quote total, and exported to
Workspace at hard cost. This is the list the EMI add-ons should feed (raw).

---

## Inconsistencies to reconcile deliberately (don't copy blindly)

1. **Two MW-shock testing tables** disagree: `mwTesting()` (quote: 4575/5575/6250
   at 2500/3500 lb) vs Picker `mws_test` (3975/4575/5275/5975 at 200/500/1000
   lb). Pick one; make both paths use it.
2. **Noise setup ignores global drill/fab** (uses chamber base only) — unlike
   every other mechanical section. Intentional, but easy to break.
3. **440VAC $6,500 never reaches the quote total** in Classic (see above) — V2
   should fix via the budget toggle.
4. **Estimator setup prices are hard-coded per `PRODUCTS` row** and never reach
   the total; only `calcSummary` does. One shared constants module in V2
   prevents this drift.

---

## Proposed Phase 4 build order

1. **Pricing foundation** — one `pricing/` module: all constants/tables
   (already partly in `data/constants.ts` + `data/catalog.ts`), `sf`/`r25`,
   `sectionSetup`, and the shared setup state. Single source both the calculator
   and the Picker read from.
2. **Line-item engine** — a `calcSummary` equivalent: takes section state →
   returns ordered line items + total, honoring overrides. Wire into QuotePage's
   line-items card (replaces/augments the current read of stored lines).
3. **Mechanical sections first** (Vibration, Shock, Noise, Airborne,
   Structureborne, Environmental, HFV, SHO, Instrumentation) — flat pricing,
   establishes the section-form pattern + the `ti` links.
4. **Shift sections** (EMI, PQ, DCM) with progressive disclosure + budget
   add-ons (RS103, 440V raw-to-budget).
5. **Overtime** with editable base/tech rates; **Procedures/Reports**, CoC,
   Modal, Fixture, Subcontract, Teardown auto.
6. Reconcile the Picker's smart prices to the shared constants.

All read-only-preview until Phase 7 writes, same as the rest of V2.

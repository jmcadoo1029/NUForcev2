# NUForce V2 — Open Items & Decisions

Living tracker for the rebuild. Update as decisions are made.

## ⚑ Flagged to discuss before building (do not forget)

- **One-time Salesforce → picker line conversion.** The main-form Custom Line
  Items section is used almost exclusively by the one-time Salesforce import
  (a finite, historical, already-locked set). Options on the table:
  (a) **convert-on-open** — non-destructive, prompt on load, keep original,
  disclaimer to verify against the saved network copy; or
  (b) **one-time bulk conversion** — sweep every Salesforce quote's custom lines
  into picker lines in the DB once and retire the old shape.
  **Jordan wants to talk this through when the time comes (Phase 5).** Do not
  implement either path until that conversation happens.

## Stability audit (cleanup pass)

Done this pass:
- **Unified opportunity helpers** → new `src/lib/opp.ts` (`baseOpp`, `revRank`,
  `yearOfOpp`). Removed 7 copy-pasted `baseOpp`/`baseOf` + 5 `revRank` copies
  across dashboard hooks, plus the inline base-strip in `quotes.ts` and the two
  `yearOf*` variants. **Fixed a latent divergence** — `quotes.ts` stripped all
  trailing rev letters while the hooks stripped one; standardized on strip-all
  (identical for single-letter revs, correct for multi-letter).
- **Card reuse** — `QuoteActions` and `ApprovalBar` now use `<Card>` instead of
  re-implementing its surface, so they track Card restyles.
- **Renamed `RemindersCard` → `InProgressCard`** (it renders "In progress"; the
  old name was stale/misleading).
- **Shared `menuItemStyle`** (`src/components/styles.ts`) replaces the duplicated
  `specMenuItem` const in QuotePage + PricingCalculator.
- **Removed dead `AccountSearch.tsx`** (superseded by `GlobalSearch`).

- **Split `QuotePage.tsx`** ✅ Done (886 → 363 lines, behavior-preserving,
  verified by build after every step). Extracted: pure data → `data/quoteDefaults.ts`
  (defaults/option lists/types) + `data/budget.ts` (markup math, +`str` in
  `lib/format`); shared field primitives → `features/quote/form/fields.tsx`; and
  section cards → `form/{RelatedContacts,QuoteInfoCard,TestItemCard,SpecsNotes,
  LineItemsCard,BudgetCard}.tsx`. QuotePage is now the orchestrator (state, load,
  handlers, header, composition). Dropped dead `StatusBadge`/`badgeColor`.

Deferred (flagged, not done — deliberately, to avoid destabilizing):
- **Split `PricingCalculator.tsx`** (~850) — the other big file. Harder than
  QuotePage: one tabbed component whose ~13 tabs share heavily-coupled pricing
  state/derived values, so a clean split means threading a lot of state per tab.
  Worth doing as its own careful pass (extract per-tab panels + lift the shared
  setup/derived block), not bundled with other work.
- **`RecentlyWorkedCard.tsx`** is a complete, working dashboard card that is not
  wired into `DashboardHome`. Decide: wire it in, or remove it. (Left as-is.)
- Nice-to-haves: a `useAsync(loadFn)` helper to collapse the ~10 identical fetch
  hooks; a `fmtDateTime` in `format.ts`; a `moveItem` drag util; route `AddButton`
  / `specTriggerBtn` through the shared `<Button>`.

Kept intentionally (not dead): the write methods in `restFetch`/`rpc.ts` (staged
for Phase 7 writes).

Manual device cleanup (files removed/renamed in the repo — the device copies are
now orphaned but harmless; delete when convenient):
`src/features/dashboard/AccountSearch.tsx`, `src/features/dashboard/RemindersCard.tsx`,
`src/features/quote/pdf/buildDcMagPdf.ts`, `src/features/quote/pdf/buildEmiPdf.ts`,
`src/features/quote/pdf/specCommon.ts`.

## Open decisions

- **Manager role source.** Resolve manager-vs-user from the existing
  `employees.role_id → permission_roles.capabilities` system (same mechanism as
  `access_nuforce` and `nuforce_approve_quotes`). Ask Russ: is there a capability
  that marks a manager, or can he add one (e.g. `nuforce_manager`)?
- **Convert-on-load save behavior** — after converting a legacy quote, does
  saving overwrite the same row or write a new revision (preserving the legacy
  row)? Leaning new-revision.

## Locked decisions

- Stack: React + Vite + **TypeScript**, modular feature-first structure.
- Same Supabase / PostgREST / auth patterns (this scaffold ports them).
- Theme: light/modern, bigger type, one NU-red accent, **no emoji**.
- Remove: Advanced Mode, main-form Custom Line Items (→ Picker), AI assistant.
- Dashboard: streamlined top bar; combined Closed-Won card; combined Product
  Codes + Compare; the two "this month" widgets reworked to rolling **3-month**
  views (quoted vs. won codes; active accounts with a By-quoting / By-won toggle,
  showing $ and count together).
- Two role-based dashboards (Manager / My Work).
- **Classic ↔ V2 coexistence** like Salesforce Classic/Lightning: same backend,
  per-user switch, deployed side by side. **V2 read-only first**, flip to
  read/write once round-trip safety is proven. (V1 = "Classic" from now on.)
- Locking model kept as-is: soft edit-gate (view→EDIT) + hard lock (approval /
  manual). Approver = `nuforce_approve_quotes` capability. **Salesforce imports
  are treated as already-approved quotes** (they were approved before import):
  they load with approval status = approved, are locked, and an approver reopens
  them to edit via the same "Reopen to edit" button any approved quote uses — no
  Salesforce-specific lock or button. Provenance shows as a muted "imported from
  Salesforce" note only.
- Per-quote **routing** so right-click "open in new tab" works natively (V2 only).
- **Responsive / mobile-aware** on every screen.
- Right-click new-tab: **V2 only**, not retrofitted into Classic.

## Captured feature notes

- **Send → email with local attachments.** The "Send" chip in the Quote actions
  bar (`QuoteActions.tsx`) is Jordan's hook for email. When wired, clicking Send
  must let the user **select attachments from their local computer** and include
  them on the outgoing email (in addition to the quote PDF). In a deployed web
  app this is a standard user-initiated file picker (`<input type="file" multiple>`),
  not the device bridge. The send itself still records the `follow_ups` row
  (sent_at / sent_by) that flips the chip to "Sent" and starts the follow-up
  clock. Build with the email/send integration (Phase 7).
- **EMI budget add-ons.** RS103 amplifier ($5,000) and 440V CE power-source
  rental ($6,500): a **pre-checked** "Add to budget" toggle appears when the
  trigger condition is met, and sends the **raw** number to the budget list
  (the budget section applies its own user-defined markup — do NOT pre-mark-up).
  Persist the toggle state with the quote.
- **Overtime tab.** Make **base rate** and **tech rate** editable fields instead
  of baked-in constants.
- **Picker custom line = repeatable.** Add multiple custom lines at once, each
  with its own product code, committed together.
- **EMI/PQ de-bulk.** Setup knobs collapsed by default; tests as clean
  expandable rows; sticky price summary; PQ shows a single standard at a time.
- **Reminders / open quotes placement.** Classic shows the reminders list in a
  left-side slide-out tab, which Jordan dislikes. Placement in My Work is TBD —
  decide a better home when building the worklist (My Work view).
- **Picker line labels — drop "Only".** Some picker/product-code labels read
  "Temperature Only", "Humidity Only", etc. Strip the word "Only" so they read
  just "Temperature", "Humidity" (likely the Environmental T&H options). Apply
  when porting the calculator/picker labels (Phase 3/4).

## Remaining feature backlog (Jordan's list, 3 buckets by dependency)

Needs the **write path** (Phase 7) to truly function — buildable now as read-only
display + preview-action shells that light up when writes land:

- **Approvals workflow** — submit-for-approval, pending/approved/rejected states,
  soft-lock (edit-gate) + hard-lock, approver = `nuforce_approve_quotes`. Backbone
  that closed-won / Workspace hang off.
- **Quote-side actions (Flag / Mark as sent / Follow-up).** ✅ Done as
  **preview** — a "Quote actions" card on the quote page (`QuoteActions.tsx` +
  `lib/quoteActions.ts`) reads the quote's live flag (`quote_flags`) and send /
  follow-up history (`follow_ups`) so it mirrors the dashboard FlaggedQuotes /
  FollowUps / ReadyToSend cards, and exposes Flag/Resolve, Mark-as-sent, and
  Mark-followed-up / reschedule toggles. Reads are live + fail-soft; the toggles
  are local preview until writes land (Phase 7), when they insert/update those
  tables.
- **Chatter on quotes.** ✅ Done as **preview** — a "Chatter" button in the Quote
  actions bar (with an entry-count badge) opens a modal thread reading the
  quote's `data.chatterEntries` (`{by, at, msg}`, newest first); posting appends
  locally with a preview note. Persists into `data.chatterEntries` on save at
  Phase 7 (same shape Classic saves).
- **Closed-won procedure.** ✅ Capture done as **preview** — a "Closed-Won
  details" card (`ClosedWonDetails.tsx`) appears once a quote is won-approved /
  Closed Won: Won Date / Job # / PO # (`wonInfo`), internal-only (not on the
  PDF), with a lock toggle. Edits are preview (persist into `data.wonInfo` +
  `job_number`/`po_number`/`won_date` columns at Phase 7). The **Create
  Workspace project** button is parked — it needs the Workspace integration
  (`create_project_from_nuforce`); shows a preview note for now.

Needs **Workspace integration** (external API/data):

- **CRR / EMI Quote workup link** — the CRR view on EMI/PQ/DCM reads `crrWorkup`
  seed data from Workspace. Parked until that data source is wired.
- **Closed-won → Workspace project link** — create the Workspace project from the
  won quote (`create_project_from_nuforce` contract).

Buildable **now** (frontend, little/no write dependency):

- **PDF exports — Quote + Budget.** ✅ Done — ported Classic's `buildPDF`
  verbatim (Letter, **jsPDF 2.5.1**, manual drawing, embedded NU logo + Jordan
  signature) so output matches Classic exactly. "Quote PDF" + "Budget PDF"
  buttons in the quote header; jsPDF is lazy-loaded on click (code-split, out of
  the main bundle). Line items render from V2's unified drag-ordered list, and
  **line-item descriptions now wrap** — row height grows to fit instead of
  Classic's fixed 26pt row that forced manual truncation. Verified by rendering
  the generated PDFs. Files: `pdf/buildQuotePdf.ts`, `pdf/savePdf.ts`,
  `pdf/assets.ts`. **Requires `npm install`** on the target (adds the `jspdf`
  dependency).
- **Test Specifications — Spec Builder.** ✅ Done (from-quote + Classic). The
  spec output in V2 is the **Spec Builder**, Classic's standalone table tool
  (`public/classic-spec-builder.html`, opened in a new tab), NOT the old
  per-standard stacked-row PDFs — Jordan wants only the Spec Builder in V2, so
  those were retired (deleted `pdf/buildDcMagPdf.ts`, `pdf/buildEmiPdf.ts`,
  `pdf/specCommon.ts`). A "Spec Builder ↗" button in the calculator header opens
  a 3-option menu: **Classic** (blank), **from NUForce** (builds a payload from
  the calculator's EMI/PQ/DCM selections → localStorage `nuforce_spec_builder_payload`
  → `?mode=from-quote`), and **from CRR** (preview — alerts; needs the Workspace
  CRR workup). Payload builder ported from Classic's `buildSpecBuilderPayload`;
  uses `emiSpecDefs.ts` + `pqSpecDefs.ts` (kept for this). DC Mag inclusion is
  gated by an "Include DC Magnetics" checkbox in the DCM tab. **From CRR stays
  parked** until the Workspace `crrWorkup` integration lands.
- **Edit the In Progress list** on the dashboard. ✅ Done as **preview-only** —
  Edit mode on the shared board (open_quotes) adds/edits/deletes rows and
  drag-reorders them, with a note that changes are local and don't persist or
  sync to other users until the write path lands. Jordan chose preview over
  going live on this table for now; flip to real writes in Phase 7 (open_quotes
  is the safest table to pilot writes on when we get there).
- **Dashboard global search.** ✅ Done — top-bar `GlobalSearch` replaces the
  account-only search. Searches quote numbers, accounts, contacts, and emails
  (top-level columns reliably + quote `data` JSON path for people/email, which
  fails soft). Quote-number input is normalized so 23-123 and 23123 match the
  same opportunity. Grouped results (Accounts → Quotes); quotes open by
  opportunity number, accounts open the account page. (`lib/search.ts` +
  `GlobalSearch.tsx`; old `AccountSearch.tsx` now unused.)
- **Related contacts + copy-email.** ✅ Done — the quote form has a Related
  Contacts card (name/title/email/phone; display + editable-preview rows) and a
  click-to-copy icon next to the primary contact's email (and each related
  contact's email). Related contacts will source from the Workspace client list
  alongside the primary contact later; free-text/local preview for now.
- **Revision history viewer.** ✅ Done — "Revisions" button in the quote header
  opens a modal listing the whole opportunity family (26-257, 26-257A…), each
  with stage, updated date, approval/won badges, total, and a link to open it;
  the current revision is marked. Each row **expands inline to a diff vs. the
  prior revision**: line items added/removed/re-priced, scalar field changes
  (old → new), and word-level diffs of the free-text fields (Specifications,
  Notes, Loads) with adds highlighted green / removals struck red. The base
  revision (no predecessor) shows its line items as a baseline.
  (`RevisionHistory.tsx` + `revDiff.ts` + `fetchRevisions` / `fetchQuoteData`.)
  Note: this diffs between *stored revisions* (each a full snapshot). A
  within-a-revision field-level edit log needs the Phase 7 write path.
- **Approval history viewer.** ✅ Done — timeline modal on the ApprovalBar
  (submitted / approved / rejected / won events, who + when + comments).

## Phase status

- [x] Phase 0 — Scaffold + theme foundation + routing
- [~] Phase 1 — Component library (Button, Card, Tabs, StatTile — more as needed)
- [~] Phase 2 — Data layer & quote model. Done: restFetch/rpc/auth ported,
  localhost dev-token gate, quote model + legacy line-item adapter, live
  read-only reads (recent quotes on the dashboard; full quote on /quote/:id).
  Next: capability/role resolution, richer quote fields.
- [ ] Phases 3–11 — see the build plan

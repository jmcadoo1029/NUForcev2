// ============================================================================
// Supabase Edge Function: market-research   (NUForce Market Research — Phase 1)
// Path in Supabase: /functions/market-research/index.ts
// ============================================================================
// Pulls recent federal CONTRACT AWARDS for NUForce's testing lane from
// USASpending.gov (free, keyless), tags each with a best-guess test family,
// matches the winning company against NUForce accounts (clients), caches them in
// market_opportunities, and returns the list. Also handles row status/assignment
// updates. Phase 2 will add SAM.gov solicitations here behind SAM_API_KEY.
//
// Dashboard setting: "Verify JWT" = OFF (we verify the caller's token ourselves).
// Secrets used: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (all
// auto-provided by Supabase). No external key needed for awards.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const env = (k: string) => Deno.env.get(k) || '';
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

const USASPENDING = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
const AWARD_URL = (gid: string) => `https://www.usaspending.gov/award/${encodeURIComponent(gid)}/`;

// Test-family keyword map (audited from NUForce's product catalog). Used to tag each
// award and, when a family is selected in the UI, to pass its terms to USASpending as
// a keyword OR-filter. NAICS 541380 is the primary net; these refine/rank.
const FAMILIES: Array<[string, string[]]> = [
  ['shock', ['shock', 'mil-s-901', 'mil-dtl-901', 'barge test', 'deck simulating']],
  ['vibration', ['vibration', 'mil-std-167', 'random vib', 'sine vib']],
  ['emi_emc', ['mil-std-461', 'electromagnetic', 'emi test', 'emc test', ' emi', ' emc']],
  ['power_quality', ['mil-std-1399', 'power quality']],
  ['dc_magnetics', ['magnetic', '1399-070']],
  // Acoustic noise (MIL-STD-810 Method 515) + audio noise susceptibility. Placed before
  // temp_humidity so an 810-Method-515 notice tags as acoustic rather than generic 810.
  ['acoustic', ['acoustic noise', 'acoustic', 'noise susceptibility', 'method 515', 'mil-std-810 method 515', '810-515']],
  ['temp_humidity', ['temperature', 'humidity', 'thermal', 'mil-std-810', 'iec 60068', 'do-160']],
  ['altitude', ['altitude', 'decompression']],
  ['salt_fog', ['salt fog', 'salt spray', 'astm b117']],
  ['water_ingress', ['submergence', 'immersion', 'watertight', 'drip test', 'spray test', 'wind-driven rain', 'ingress protection']],
  ['hydrostatic', ['hydrostatic', 'pressure test']],
  ['noise', ['airborne noise', 'structureborne noise', 'mil-std-740']],
  ['shielding', ['shielding effectiveness', 'enclosure effectiveness', 'ieee-299', 'mil-std-285']],
  ['dielectric', ['insulation resistance', 'dielectric', 'hipot']],
  ['ess', ['environmental stress screening', ' ess ']],
  ['acceleration', ['acceleration', 'centrifuge']],
  ['environmental', ['environmental test', 'qualification test', 'first article', 'mil-std-810']],
];
const familyTerms = (key: string) => (FAMILIES.find((f) => f[0] === key)?.[1] || []).map((t) => t.trim()).filter(Boolean);
const familyOf = (text: string): string => {
  const t = (' ' + (text || '').toLowerCase() + ' ');
  for (const [key, terms] of FAMILIES) if (terms.some((term) => t.includes(term))) return key;
  return '';
};

// Normalize a company name for matching (drop legal suffixes + punctuation).
function normName(s: string): string {
  let x = (s || '').toUpperCase().replace(/[.,&]/g, ' ').replace(/\s+/g, ' ').trim();
  x = x.replace(/\b(INCORPORATED|INC|LLC|LLP|LP|CORPORATION|CORP|COMPANY|CO|LTD|LIMITED|THE|USA|US)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return x;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  const SUPABASE_URL = env('SUPABASE_URL');
  const ANON = env('SUPABASE_ANON_KEY');
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
  const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

  // Auth: a signed-in NUForce user (bearer JWT), OR an internal call from the weekly
  // digest carrying the shared SCHEDULE_TICK_SECRET as x-tick-secret.
  const TICK = env('SCHEDULE_TICK_SECRET');
  const internal = !!(TICK && (req.headers.get('x-tick-secret') || '') === TICK);
  if (!internal) {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json(401, { ok: false, error: 'Missing bearer token.' });
    try {
      const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } });
      if (!ures.ok) return json(401, { ok: false, error: 'Invalid or expired session.' });
    } catch {
      return json(401, { ok: false, error: 'Could not verify session.' });
    }
  }

  let body: any;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: 'Invalid JSON body.' }); }
  const action = str(body.action) || 'search';

  // ── Update a row's status / assignment ──────────────────────────────────────
  if (action === 'update') {
    const id = str(body.id);
    if (!id) return json(400, { ok: false, error: 'id is required.' });
    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) patch.status = str(body.status);
    if (body.assigned_to !== undefined) patch.assigned_to = str(body.assigned_to) || null;
    if (!Object.keys(patch).length) return json(400, { ok: false, error: 'Nothing to update.' });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/market_opportunities?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
    });
    if (!res.ok) return json(500, { ok: false, error: `Update failed: ${res.status} ${(await res.text()).slice(0, 200)}` });
    return json(200, { ok: true });
  }

  // ── Search awards (USASpending) ─────────────────────────────────────────────
  const kind = str(body.kind) === 'solicitation' ? 'solicitation' : 'award';
  const agencyScope = str(body.agencyScope) || 'dod';         // 'dod' | 'all'
  const monthsBack = Math.min(60, Math.max(1, num(body.monthsBack) || 12));
  const keyword = str(body.keyword);
  const family = str(body.family);
  const limit = Math.min(100, Math.max(10, num(body.limit) || 100));

  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - monthsBack, end.getDate());
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  let rows: any[] = [];

  if (kind === 'solicitation') {
    // ── Active solicitations (SAM.gov Opportunities API) ──────────────────────
    const SAM_KEY = env('SAM_API_KEY');
    if (!SAM_KEY) return json(400, { ok: false, error: 'SAM_API_KEY is not set on this function. Add it (Phase 2) to enable solicitations.' });
    // SAM requires a posted window ≤ 1 year, as MM/dd/yyyy.
    const samStart = new Date(Math.max(start.getTime(), end.getTime() - 364 * 864e5));
    const mdy = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    const params = new URLSearchParams({ api_key: SAM_KEY, ncode: '541380', postedFrom: mdy(samStart), postedTo: mdy(end), limit: String(limit) });
    if (keyword) params.set('title', keyword);
    let sam: any = {};
    try {
      const r = await fetch(`https://api.sam.gov/opportunities/v2/search?${params.toString()}`);
      if (!r.ok) return json(502, { ok: false, error: `SAM.gov error ${r.status}: ${(await r.text()).slice(0, 300)}` });
      sam = await r.json();
    } catch (e) {
      return json(502, { ok: false, error: `SAM.gov request failed: ${e instanceof Error ? e.message : String(e)}` });
    }
    const data: any[] = Array.isArray(sam?.opportunitiesData) ? sam.opportunitiesData
      : Array.isArray(sam?._embedded?.opportunitiesData) ? sam._embedded.opportunitiesData : [];
    const BID_TYPES = ['Solicitation', 'Combined Synopsis/Solicitation', 'Presolicitation', 'Sources Sought'];
    const nowMs = Date.now();
    rows = data.filter((o) => {
      if (!BID_TYPES.includes(str(o.type))) return false;            // bid-relevant notice types only
      const dl = str(o.responseDeadLine);
      if (dl) { const t = new Date(dl).getTime(); if (!isNaN(t) && t < nowMs) return false; } // open only
      if (agencyScope === 'dod' && !/DEFENSE|NAVY|ARMY|AIR FORCE|MARINE|DEFENSE LOGISTICS/i.test(str(o.fullParentPathName))) return false;
      return true;
    }).map((o) => {
      const noticeId = str(o.noticeId);
      const pop = o.placeOfPerformance || {};
      const title = str(o.title) || '(no title)';
      // Contracting point(s) of contact. SAM returns a pointOfContact[] with
      // type (primary/secondary), fullName, title, email, phone. Pull the primary
      // and a distinct secondary so the tab + digest can show who to email.
      const pocs: any[] = Array.isArray(o.pointOfContact) ? o.pointOfContact : [];
      const byType = (want: string) => pocs.find((p) => str(p?.type).toLowerCase().includes(want)) || null;
      const primary = byType('primary') || pocs[0] || null;
      const secondary = byType('secondary') || pocs.find((p) => p !== primary) || null;
      const pName = (p: any) => (p ? (str(p.fullName) || str(p.fullname) || str(p.name) || null) : null);
      const pMail = (p: any) => (p ? (str(p.email).toLowerCase() || null) : null);
      const pPhone = (p: any) => (p ? (str(p.phone) || null) : null);
      return {
        source: 'sam_opportunity',
        source_id: noticeId,
        kind: 'solicitation',
        title,
        agency: str(o.fullParentPathName).replace(/\./g, ' · '),
        sub_agency: str(o.office) || null,
        naics: str(o.naicsCode),
        psc: str(o.classificationCode),
        amount: null,
        posted_date: str(o.postedDate).slice(0, 10) || null,
        response_deadline: str(o.responseDeadLine).slice(0, 10) || null,
        company_name: null,
        company_city: str(pop?.city?.name) || null,
        company_state: str(pop?.state?.name) || str(pop?.state?.code) || null,
        poc_name: pName(primary),
        poc_email: pMail(primary),
        poc_phone: pPhone(primary),
        poc2_name: pName(secondary),
        poc2_email: pMail(secondary),
        poc2_phone: pPhone(secondary),
        url: str(o.uiLink) || (noticeId ? `https://sam.gov/opp/${noticeId}/view` : null),
        matched_client_id: null,
        match_kind: null,
        family: familyOf(`${title} ${str(o.typeOfSetAsideDescription)}`),
        last_seen_at: nowIso,
        raw: o,
      };
    }).filter((x) => x.source_id);
  } else {
    // ── Recent awards (USASpending) ───────────────────────────────────────────
    const filters: Record<string, unknown> = {
      award_type_codes: ['A', 'B', 'C', 'D'], // BPA call, purchase order, delivery order, definitive contract
      naics_codes: ['541380'],
      time_period: [{ start_date: ymd(start), end_date: ymd(end) }],
    };
    if (agencyScope === 'dod') filters.agencies = [{ type: 'awarding', tier: 'toptier', name: 'Department of Defense' }];
    const kws = keyword ? [keyword] : (family ? familyTerms(family) : []);
    if (kws.length) filters.keywords = kws;

    const usReq = {
      filters,
      fields: ['Award ID', 'Recipient Name', 'Awarding Agency', 'Awarding Sub Agency', 'Award Amount', 'Start Date', 'End Date', 'Description', 'recipient_id', 'generated_internal_id', 'Contract Award Type', 'NAICS', 'PSC'],
      page: 1, limit, sort: 'Award Amount', order: 'desc',
    };

    let usResults: any[] = [];
    try {
      const r = await fetch(USASPENDING, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(usReq) });
      if (!r.ok) return json(502, { ok: false, error: `USASpending error ${r.status}: ${(await r.text()).slice(0, 300)}` });
      const data = await r.json();
      usResults = Array.isArray(data?.results) ? data.results : [];
    } catch (e) {
      return json(502, { ok: false, error: `USASpending request failed: ${e instanceof Error ? e.message : String(e)}` });
    }

    // Load clients for account matching (best-effort).
    const clientsByNorm = new Map<string, { id: string; name: string }>();
    const clientsList: Array<{ id: string; name: string; norm: string }> = [];
    try {
      const cr = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=id,name`, { headers: H });
      if (cr.ok) {
        const cs = await cr.json();
        for (const c of (cs || [])) {
          const n = normName(str(c.name));
          if (!n) continue;
          if (!clientsByNorm.has(n)) clientsByNorm.set(n, { id: c.id, name: c.name });
          clientsList.push({ id: c.id, name: c.name, norm: n });
        }
      }
    } catch { /* matching is best-effort */ }

    const matchClient = (company: string): { id: string | null; kind: string } => {
      const n = normName(company);
      if (!n) return { id: null, kind: 'prospect' };
      const exact = clientsByNorm.get(n);
      if (exact) return { id: exact.id, kind: 'account' };
      if (n.length >= 5) {
        const hit = clientsList.find((c) => c.norm.length >= 5 && (c.norm.includes(n) || n.includes(c.norm)));
        if (hit) return { id: hit.id, kind: 'account' };
      }
      return { id: null, kind: 'prospect' };
    };

    rows = usResults.map((r) => {
      const company = str(r['Recipient Name']);
      const gid = str(r['generated_internal_id']);
      const sourceId = gid || str(r['Award ID']);
      const m = matchClient(company);
      return {
        source: 'usaspending_award',
        source_id: sourceId,
        kind: 'award',
        title: str(r['Description']) || str(r['Award ID']) || '(no description)',
        agency: str(r['Awarding Agency']),
        sub_agency: str(r['Awarding Sub Agency']),
        naics: str(r['NAICS']),
        psc: str(r['PSC']),
        amount: num(r['Award Amount']),
        company_name: company,
        url: gid ? AWARD_URL(gid) : null,
        matched_client_id: m.id,
        match_kind: m.kind,
        family: familyOf(`${str(r['Description'])} ${str(r['Awarding Sub Agency'])}`),
        last_seen_at: nowIso,
        raw: r,
      };
    }).filter((x) => x.source_id);
  }

  if (!rows.length) return json(200, { ok: true, count: 0, items: [] });

  // Upsert (merge-duplicates): source fields + match + last_seen_at are updated;
  // status / assigned_to / first_seen_at are NOT in the payload, so existing values
  // (e.g. 'dismissed') are preserved. return=representation gives us the stored rows.
  let stored: any[] = [];
  try {
    const up = await fetch(`${SUPABASE_URL}/rest/v1/market_opportunities?on_conflict=source,source_id`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows),
    });
    if (!up.ok) return json(500, { ok: false, error: `Cache upsert failed: ${up.status} ${(await up.text()).slice(0, 300)}` });
    stored = await up.json();
  } catch (e) {
    return json(500, { ok: false, error: `Cache upsert threw: ${e instanceof Error ? e.message : String(e)}` });
  }

  // Optional family filter (defensive; no-op when family is empty). Solicitations
  // sort by soonest response deadline; awards by largest amount.
  const items = (family ? stored.filter((s) => s.family === family) : stored)
    .sort((a, b) => kind === 'solicitation'
      ? (str(a.response_deadline) || '9999-99-99').localeCompare(str(b.response_deadline) || '9999-99-99')
      : num(b.amount) - num(a.amount));

  return json(200, { ok: true, count: items.length, items });
});

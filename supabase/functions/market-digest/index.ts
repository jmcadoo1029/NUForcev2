// ============================================================================
// Supabase Edge Function: market-digest   (NUForce Market Research — Phase 3)
// Path in Supabase: /functions/market-digest/index.ts
// ============================================================================
// Weekly email of NEW market opportunities (solicitations + awards) discovered in
// the last 7 days. It first asks market-research to refresh the cache (DoD scope,
// both kinds), then emails everything newly seen to the configured recipients.
//
// Fired by Supabase cron (pg_cron + pg_net) once a week, passing the shared
// SCHEDULE_TICK_SECRET as the x-tick-secret header — same pattern as schedule-tick
// and mass-email-digest.
//
// Dashboard: "Verify JWT" = OFF. Secrets: RESEND_API_KEY, SCHEDULE_TICK_SECRET,
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto). Optional:
// MARKET_DIGEST_RECIPIENTS (comma-separated emails; defaults to oversight).
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const env = (k: string) => Deno.env.get(k) || '';
const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const RESEND_API_KEY = env('RESEND_API_KEY');
const TICK_SECRET = env('SCHEDULE_TICK_SECRET');
const SENDING_DOMAIN = 'mail.nulabs.com';

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const money = (n: number) => '$' + (Math.round(n) || 0).toLocaleString('en-US');
const fmtDate = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

const FAMILY_LABELS: Record<string, string> = {
  shock: 'Shock', vibration: 'Vibration', emi_emc: 'EMI / EMC', power_quality: 'Power Quality',
  dc_magnetics: 'DC Magnetics', acoustic: 'Acoustic Noise (515)', temp_humidity: 'Temp / Humidity', altitude: 'Altitude / Decompression',
  salt_fog: 'Salt Fog', water_ingress: 'Water Ingress', hydrostatic: 'Hydrostatic / Pressure',
  noise: 'Airborne / Structureborne Noise', shielding: 'Shielding Effectiveness',
  dielectric: 'Insulation / Dielectric', ess: 'ESS', acceleration: 'Acceleration', environmental: 'Environmental / Qual',
};

serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') return new Response('method not allowed', { status: 405 });
  if (TICK_SECRET) {
    if ((req.headers.get('x-tick-secret') || '') !== TICK_SECRET) return new Response('forbidden', { status: 403 });
  }
  if (!RESEND_API_KEY) return new Response(JSON.stringify({ ok: false, error: 'RESEND_API_KEY not set' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const result = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  // 1) Refresh the cache via market-research (both kinds, DoD scope). Best-effort —
  //    even if a refresh call fails, we still email whatever is newly cached.
  const refresh = async (kind: string) => {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/market-research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tick-secret': TICK_SECRET },
        body: JSON.stringify({ action: 'search', kind, agencyScope: 'dod', monthsBack: 12 }),
      });
    } catch { /* keep going */ }
  };
  await refresh('solicitation');
  await refresh('award');

  // 2) Pull everything first seen in the last 7 days (not dismissed).
  const cutoff = new Date(Date.now() - 7 * 864e5).toISOString();
  let rows: any[] = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/market_opportunities?select=*&first_seen_at=gte.${encodeURIComponent(cutoff)}&status=neq.dismissed&order=kind.asc,response_deadline.asc,amount.desc&limit=200`, { headers: H });
    if (r.ok) rows = await r.json();
  } catch { /* leave empty */ }

  const sols = rows.filter((x) => x.kind === 'solicitation');
  const awards = rows.filter((x) => x.kind === 'award');
  if (!sols.length && !awards.length) return result({ ok: true, sent: 0, note: 'Nothing new this week.' });

  // Recipients come from the per-user toggle (Users → "Market research digest"), so the
  // list is managed in-app, not via a secret. Opt-in only: no one opted in → send nothing.
  let recipients: string[] = [];
  try {
    const sr = await fetch(`${SUPABASE_URL}/rest/v1/nuforce_user_settings?select=email,notify_market_digest&notify_market_digest=eq.true`, { headers: H });
    if (sr.ok) { const s = await sr.json(); recipients = [...new Set((s || []).map((x: any) => str(x.email).toLowerCase()).filter((e: string) => e.includes('@')))]; }
  } catch { /* leave empty */ }
  if (!recipients.length) return result({ ok: true, sent: 0, note: 'no one opted in' });

  // 3) Build the email.
  const famLabel = (f: string) => (f ? ` · ${FAMILY_LABELS[f] || f}` : '');
  // Contracting POC line for a solicitation — a clickable mailto (subject pre-filled)
  // plus phone, for primary and (when present) secondary. Empty string when no POC.
  const pocHtml = (o: any) => {
    const subj = `?subject=${encodeURIComponent('Regarding: ' + str(o.title))}`;
    const one = (name: string, email: string, phone: string) => {
      if (!name && !email && !phone) return '';
      const nm = name ? `<b>${escHtml(name)}</b>` : '';
      const em = email ? `${name ? ' — ' : ''}<a href="mailto:${escHtml(email)}${subj}" style="color:#b3282d;font-weight:700;text-decoration:none">${escHtml(email)}</a>` : '';
      const ph = phone ? `${(name || email) ? ' · ' : ''}${escHtml(phone)}` : '';
      return nm + em + ph;
    };
    const p1 = one(str(o.poc_name), str(o.poc_email), str(o.poc_phone));
    const p2 = one(str(o.poc2_name), str(o.poc2_email), str(o.poc2_phone));
    const parts = [p1, p2].filter(Boolean);
    if (!parts.length) return '';
    return `<div style="color:#667085;font-size:12px;margin-top:3px"><span style="color:#9aa2ad">Contact:</span> ${parts.join(' &nbsp;·&nbsp; ')}</div>`;
  };
  const solRow = (o: any) => `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #e6e8ec;font-size:14px">
      <a href="${escHtml(str(o.url))}" style="color:#b3282d;font-weight:700;text-decoration:none">${escHtml(str(o.title) || '(no title)')}</a>
      <div style="color:#667085;font-size:12px;margin-top:2px">${escHtml(str(o.agency))}${escHtml(famLabel(str(o.family)))}</div>
      ${pocHtml(o)}
    </td>
    <td style="padding:8px 10px;border-bottom:1px solid #e6e8ec;font-size:13px;white-space:nowrap">${o.response_deadline ? 'Due ' + fmtDate(str(o.response_deadline)) : ''}</td>
  </tr>`;
  const awardRow = (o: any) => `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #e6e8ec;font-size:14px">
      <a href="${escHtml(str(o.url))}" style="color:#1c2430;font-weight:700;text-decoration:none">${escHtml(str(o.company_name) || '(recipient)')}</a>
      <span style="font-size:12px;font-weight:700;color:${o.match_kind === 'account' ? '#1e8449' : '#a9791b'}"> &nbsp;${o.match_kind === 'account' ? 'Existing account' : 'New prospect'}</span>
      <div style="color:#667085;font-size:12px;margin-top:2px">${escHtml(str(o.title))}${escHtml(famLabel(str(o.family)))}</div>
    </td>
    <td style="padding:8px 10px;border-bottom:1px solid #e6e8ec;font-size:13px;white-space:nowrap;text-align:right">${money(Number(o.amount) || 0)}</td>
  </tr>`;

  const section = (title: string, bodyRows: string) => bodyRows
    ? `<h3 style="font-size:15px;color:#1c2430;margin:18px 0 6px">${title}</h3><table style="width:100%;border-collapse:collapse">${bodyRows}</table>`
    : '';

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1c2430">
    <h2 style="font-size:18px;margin:0 0 4px">NUForce Market Research — weekly digest</h2>
    <div style="color:#667085;font-size:13px;margin-bottom:8px">New this week (NAICS 541380, Navy/DoD) · ${sols.length} solicitation${sols.length === 1 ? '' : 's'}, ${awards.length} award${awards.length === 1 ? '' : 's'}</div>
    ${section('New solicitations (soonest deadline first)', sols.map(solRow).join(''))}
    ${section('New awards (largest first)', awards.map(awardRow).join(''))}
    <div style="color:#9aa2ad;font-size:12px;margin-top:18px">Sources: SAM.gov &amp; USASpending.gov. Open the Market Research tab in NUForce to mark Interested / Dismiss.</div>
  </div>`;
  const text = [
    `NUForce Market Research — weekly digest`,
    `New: ${sols.length} solicitations, ${awards.length} awards (NAICS 541380, Navy/DoD)`,
    ``,
    ...sols.map((o) => {
      const poc = [
        [str(o.poc_name), str(o.poc_email), str(o.poc_phone)].filter(Boolean).join(' — '),
        [str(o.poc2_name), str(o.poc2_email), str(o.poc2_phone)].filter(Boolean).join(' — '),
      ].filter(Boolean).join(' | ');
      return `SOLICITATION: ${str(o.title)} — ${str(o.agency)}${o.response_deadline ? ` (due ${fmtDate(str(o.response_deadline))})` : ''}\n  ${str(o.url)}${poc ? `\n  Contact: ${poc}` : ''}`;
    }),
    ...awards.map((o) => `AWARD: ${str(o.company_name)} ${o.match_kind === 'account' ? '[existing account]' : '[new prospect]'} — ${money(Number(o.amount) || 0)} — ${str(o.title)}\n  ${str(o.url)}`),
  ].join('\n');

  // 4) Send to the opted-in recipients resolved above.
  const subject = `NUForce Market Research — ${sols.length + awards.length} new this week`;
  let sent = 0;
  for (const to of recipients) {
    try {
      const rr = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `NUForce Market Research <notifications@${SENDING_DOMAIN}>`, to: [to], subject, text, html }),
      });
      if (rr.ok) sent++;
    } catch { /* continue */ }
  }
  return result({ ok: true, sent, solicitations: sols.length, awards: awards.length });
});

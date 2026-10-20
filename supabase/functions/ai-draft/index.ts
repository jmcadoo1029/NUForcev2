// ============================================================================
// Supabase Edge Function: ai-draft
// Path in Supabase: /functions/ai-draft/index.ts
// ============================================================================
// Generates a short follow-up email draft (subject + body) from a plain-language
// instruction, for the NUForce "Follow-up reminders" composer. If the instruction
// names a quote number, it looks that quote up (service role) and feeds real
// details to the model so the draft references specifics.
//
// Dashboard: "Verify JWT" = OFF (we verify the caller's token ourselves, same as
// market-research). Secrets: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL
// (optional, default claude-haiku-5-5), plus the auto SUPABASE_URL /
// SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const env = (k: string) => Deno.env.get(k) || '';
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

// Pull a NU Labs quote number out of free text: "26-123", "#26-123", "26-123B".
function parseQuoteNo(text: string): string | null {
  const m = String(text || '').match(/\b(\d{2}-\d{2,6})([A-Za-z])?\b/);
  return m ? m[1] + (m[2] || '') : null;
}
const baseOpp = (opp: string) => opp.replace(/[A-Za-z]+$/, '');

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  const SUPABASE_URL = env('SUPABASE_URL');
  const ANON = env('SUPABASE_ANON_KEY');
  const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
  const ANTHROPIC_API_KEY = env('ANTHROPIC_API_KEY');
  const MODEL = env('ANTHROPIC_MODEL') || 'claude-haiku-5-5';

  // Auth: a signed-in NUForce user (bearer JWT).
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { ok: false, error: 'Missing bearer token.' });
  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } });
    if (!ures.ok) return json(401, { ok: false, error: 'Invalid or expired session.' });
  } catch {
    return json(401, { ok: false, error: 'Could not verify session.' });
  }

  if (!ANTHROPIC_API_KEY) return json(400, { ok: false, error: 'ANTHROPIC_API_KEY is not set on this function.' });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: 'Invalid JSON body.' }); }
  const prompt = str(body.prompt);
  const contactName = str(body.contactName);
  const account = str(body.account);
  const senderName = str(body.senderName);
  if (!prompt) return json(400, { ok: false, error: 'Tell me what the email should say.' });

  // ── Optional quote grounding ────────────────────────────────────────────────
  let quoteCtx = '';
  let usedQuote: string | null = null;
  const qn = parseQuoteNo(prompt);
  if (qn) {
    try {
      const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
      const base = baseOpp(qn);
      const rows: any[] = await fetch(
        `${SUPABASE_URL}/rest/v1/quotes?select=opportunity,customer,total,stage,created_at,data&opportunity=ilike.${encodeURIComponent(base + '*')}&order=opportunity.desc&limit=12`,
        { headers: H },
      ).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      // Prefer an exact match, else the highest revision in the family.
      const exact = rows.find((r) => str(r.opportunity).toUpperCase() === qn.toUpperCase());
      const chosen = exact || rows[0];
      if (chosen) {
        usedQuote = str(chosen.opportunity);
        const d = chosen.data || {};
        const labels = new Set<string>();
        for (const l of (d.pickerLines || [])) { const s = str(l.label); if (s) labels.add(s); }
        for (const l of (d.custom?.rows || [])) { const s = str(l.label); if (s) labels.add(s); }
        for (const l of (d.summary?.lines || [])) { const s = str(l.label); if (s) labels.add(s); }
        const products = Array.from(labels).slice(0, 8).join(', ');
        const money = (n: unknown) => { const v = Number(n) || 0; return v ? '$' + Math.round(v).toLocaleString('en-US') : ''; };
        quoteCtx = [
          `Quote ${usedQuote}`,
          chosen.customer ? `Customer: ${str(chosen.customer)}` : '',
          chosen.stage ? `Stage: ${str(chosen.stage)}` : '',
          money(chosen.total) ? `Quoted total: ${money(chosen.total)}` : '',
          chosen.created_at ? `Created: ${str(chosen.created_at).slice(0, 10)}` : '',
          products ? `Tests/products quoted: ${products}` : '',
        ].filter(Boolean).join('\n');
      }
    } catch { /* grounding is best-effort */ }
  }

  // ── Generate ─────────────────────────────────────────────────────────────────
  const system = [
    'You write short, professional B2B follow-up emails for NU Labs (a.k.a. NU Laboratories), an environmental and EMI/EMC test lab, on behalf of an account manager.',
    'Keep it warm, specific, and concise — at most two short paragraphs, no marketing fluff, no emojis.',
    'If quote details are provided, reference them naturally (do not dump a list).',
    'If a sender name is provided, end with a brief sign-off using it; never use bracketed placeholders like [Your Name].',
    'Return ONLY a JSON object of the form {"subject": "...", "body": "..."} with no other text. The body is plain text; use real line breaks between paragraphs.',
  ].join(' ');
  const userMsg = [
    `Instruction: ${prompt}`,
    contactName ? `Recipient: ${contactName}` : '',
    account ? `Recipient's company: ${account}` : '',
    senderName ? `Sender (sign off as): ${senderName}` : '',
    quoteCtx ? `\nQuote details to ground the email:\n${quoteCtx}` : '',
  ].filter(Boolean).join('\n');

  let text = '';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, system, messages: [{ role: 'user', content: userMsg }] }),
    });
    if (!r.ok) return json(502, { ok: false, error: `Model error ${r.status}: ${(await r.text()).slice(0, 300)}` });
    const data = await r.json();
    // Concatenate every text block. Newer models (e.g. Haiku 5.5) emit a leading
    // "thinking" block, so content[0] is NOT the answer — we must pick the text blocks.
    const blocks = Array.isArray(data?.content) ? data.content : [];
    text = str(blocks.filter((b: any) => b?.type === 'text').map((b: any) => str(b?.text)).filter(Boolean).join('\n'));
  } catch (e) {
    return json(502, { ok: false, error: `Model request failed: ${e instanceof Error ? e.message : String(e)}` });
  }

  // Parse the JSON the model returned (tolerant of stray prose around it).
  let subject = '';
  let draft = '';
  try {
    const slice = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const parsed = JSON.parse(slice);
    subject = str(parsed.subject);
    draft = str(parsed.body);
  } catch { /* fall through to raw */ }
  if (!draft) { draft = text; if (!subject) subject = 'Following up'; }

  return json(200, { ok: true, subject, body: draft, quote: usedQuote });
});

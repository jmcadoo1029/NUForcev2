import { invokeFunction } from './workspace'

// Client for the ai-draft edge function: turn a short instruction (e.g. "general
// follow-up" or "follow up on quote #26-123") into an editable email subject + body.
// The function grounds the draft with real quote details when a quote number is named.

export interface EmailDraft { subject: string; body: string; quote: string | null }

export async function generateFollowupDraft(input: { prompt: string; contactName?: string; account?: string; senderName?: string }): Promise<EmailDraft> {
  const res = await invokeFunction<{ ok: boolean; subject?: string; body?: string; quote?: string | null; error?: string }>('ai-draft', {
    prompt: input.prompt || '',
    contactName: input.contactName || '',
    account: input.account || '',
    senderName: input.senderName || '',
  })
  if (!res?.ok) throw new Error(res?.error || 'Draft generation failed.')
  return { subject: res.subject || '', body: res.body || '', quote: res.quote ?? null }
}

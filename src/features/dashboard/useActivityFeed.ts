import { useEffect, useState } from 'react'
import { restFetch } from '../../lib/restFetch'
import type { ChatterEntry } from '../../lib/quoteActions'

// Live activity feed — the most recent human chatter + key events across all quotes.
// Chatter lives per-quote in data.chatterEntries, so we pull the most recently-updated
// quotes and flatten their entries (using a nested JSON select so we DON'T download the
// whole data blob — only data->chatterEntries). Auto send/follow-up log lines are
// filtered out; notes and key events (Closed Lost, delete/restore) stay.

export interface FeedItem {
  key: string
  quoteId: string
  opportunity: string
  customer: string
  by: string
  at: string
  msg: string
  kind?: 'quote' | 'followup' // set on the Sent feed: initial send vs a follow-up
}

interface Row {
  id: string
  opportunity?: string | null
  customer?: string | null
  chatterEntries?: ChatterEntry[] | null
}

// Auto-generated messages we never show in the feed. New auto entries carry `auto:true`
// (tagged at write time); these prefixes catch the historical ones written before that.
const AUTO_PREFIXES = [
  'Quote emailed to',
  'Follow-up email sent to',
  'Combined follow-up email sent to',
]
function isAuto(e: ChatterEntry): boolean {
  if (e.auto) return true
  const m = String(e.msg || '').trim()
  return AUTO_PREFIXES.some((p) => m.startsWith(p))
}

// The send-log lines — the inverse of what the activity view hides. These ARE the
// "sent quotes" feed: every time a quote was emailed (initial or follow-up).
const SENT_PREFIXES = ['Quote emailed to', 'Combined follow-up email sent to', 'Follow-up email sent to']
function isSend(e: ChatterEntry): boolean {
  const m = String(e.msg || '').trim()
  return SENT_PREFIXES.some((p) => m.startsWith(p))
}
function sendKind(e: ChatterEntry): 'quote' | 'followup' {
  return String(e.msg || '').trim().startsWith('Quote emailed to') ? 'quote' : 'followup'
}

// How many recent quotes to scan, and how many feed items to keep.
const SCAN_QUOTES = 200
const KEEP_ITEMS = 80

export type FeedMode = 'activity' | 'sent' | 'followups'

async function load(mode: FeedMode): Promise<FeedItem[]> {
  const rows = await restFetch<Row[]>(
    'GET',
    `quotes?select=id,opportunity,customer,chatterEntries:data->chatterEntries&order=updated_at.desc&limit=${SCAN_QUOTES}`,
  )
  const items: FeedItem[] = []
  ;(rows || []).forEach((r) => {
    const entries = Array.isArray(r.chatterEntries) ? r.chatterEntries : []
    entries.forEach((e, i) => {
      if (!e || !e.msg) return
      const k = isSend(e) ? sendKind(e) : null
      // activity = notes + key events (auto/send lines hidden); sent = initial quote
      // sends only; followups = follow-up emails only.
      const keep = mode === 'activity' ? !isAuto(e) : mode === 'sent' ? k === 'quote' : k === 'followup'
      if (!keep) return
      items.push({
        key: `${r.id}:${i}:${e.at || ''}`,
        quoteId: String(r.id),
        opportunity: r.opportunity || '',
        customer: r.customer || '',
        by: String(e.by || ''),
        at: String(e.at || ''),
        msg: String(e.msg || ''),
        ...(k ? { kind: k } : {}),
      })
    })
  })
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return items.slice(0, KEEP_ITEMS)
}

export function useFeed(mode: FeedMode, refreshKey?: number) {
  const [data, setData] = useState<FeedItem[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    setData(null)
    setErr('')
    load(mode)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e?.message || e)))
    return () => { alive = false }
  }, [mode, refreshKey])
  return { data, err }
}

/** Back-compat: the activity view. */
export function useActivityFeed(refreshKey?: number) {
  return useFeed('activity', refreshKey)
}

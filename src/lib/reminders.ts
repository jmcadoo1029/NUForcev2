import { restFetch } from './restFetch'

// Contact follow-up reminders (contact_reminders). A team-visible nudge to ping a
// contact on a cadence — set from Customer Contact → Reminders, surfaced in the
// dashboard "Needs your attention" area when due. "Pinged" reschedules by the
// reminder's interval; "Snooze" pushes it out; "Done" closes it. Callers gate on
// WRITES_ENABLED. Read-light: due = active rows whose due_at has arrived.

export interface ContactReminder {
  id: string
  contact_email: string | null
  contact_name: string | null
  account: string | null
  note: string | null
  interval_days: number
  due_at: string // YYYY-MM-DD
  status: string // 'active' | 'done'
  created_by: string | null
  last_pinged_at: string | null
  created_at?: string | null
}

const todayStr = () => new Date().toISOString().slice(0, 10)
const plusDaysStr = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }
const nowIso = () => new Date().toISOString()

export interface NewReminder { contactEmail: string; contactName: string; account: string; note: string; intervalDays: number; firstDue: string }

/** Create a recurring follow-up reminder for a contact. */
export async function createReminder(r: NewReminder, by: string): Promise<void> {
  await restFetch('POST', 'contact_reminders', {
    body: {
      contact_email: (r.contactEmail || '').trim().toLowerCase() || null,
      contact_name: r.contactName.trim() || null,
      account: r.account.trim() || null,
      note: r.note.trim() || null,
      interval_days: Math.max(1, Math.round(r.intervalDays || 21)),
      due_at: r.firstDue || todayStr(),
      status: 'active',
      created_by: by || null,
    },
  })
}

/** Active reminders that have come due (due_at today or earlier). */
export async function fetchDueReminders(): Promise<ContactReminder[]> {
  return (await restFetch<ContactReminder[]>('GET', `contact_reminders?select=*&status=eq.active&due_at=lte.${todayStr()}&order=due_at`)) || []
}

/** All active reminders (for the management list), soonest-due first. */
export async function fetchActiveReminders(): Promise<ContactReminder[]> {
  return (await restFetch<ContactReminder[]>('GET', 'contact_reminders?select=*&status=eq.active&order=due_at&limit=500')) || []
}

/** "Pinged" — reschedule by the reminder's interval (recurring), or close it when
 *  the interval is non-positive (one-off). Stamps last_pinged_at. */
export async function pingReminder(r: ContactReminder): Promise<void> {
  const body = r.interval_days && r.interval_days > 0
    ? { due_at: plusDaysStr(r.interval_days), last_pinged_at: nowIso(), updated_at: nowIso() }
    : { status: 'done', last_pinged_at: nowIso(), updated_at: nowIso() }
  await restFetch('PATCH', `contact_reminders?id=eq.${encodeURIComponent(r.id)}`, { body })
}

/** Push a reminder out by `days` without recording a ping. */
export async function snoozeReminder(id: string, days: number): Promise<void> {
  await restFetch('PATCH', `contact_reminders?id=eq.${encodeURIComponent(id)}`, { body: { due_at: plusDaysStr(days), updated_at: nowIso() } })
}

/** Stop a reminder for good. */
export async function stopReminder(id: string): Promise<void> {
  await restFetch('PATCH', `contact_reminders?id=eq.${encodeURIComponent(id)}`, { body: { status: 'done', updated_at: nowIso() } })
}

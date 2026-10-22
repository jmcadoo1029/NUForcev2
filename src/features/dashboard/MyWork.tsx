import { ReadyToSendCard } from './ReadyToSendCard'
import { DueSoonCard } from './DueSoonCard'
import { FlaggedQuotesCard } from './FlaggedQuotesCard'
import { FollowUpsCard } from './FollowUpsCard'
import { ActiveQuotesCard } from './ActiveQuotesCard'
import { RemindersCard } from './RemindersCard'

// My Work view — the personal worklist (frame/top bar comes from DashboardShell).
// Ready-to-Send, Flagged quotes, Follow-ups due, your due follow-up reminders, and
// Active-quotes-this-month all live here for everyone. Ready-to-Send and Follow-ups
// ALSO appear in the Manager's "Needs your attention" area — they're in both spots,
// not moved.
export function MyWork() {
  return (
    <>
      <ReadyToSendCard />
      <DueSoonCard />
      <FlaggedQuotesCard />
      <FollowUpsCard />
      <RemindersCard />
      <ActiveQuotesCard />
    </>
  )
}

import { ReadyToSendCard } from './ReadyToSendCard'
import { FlaggedQuotesCard } from './FlaggedQuotesCard'
import { FollowUpsCard } from './FollowUpsCard'
import { ActiveQuotesCard } from './ActiveQuotesCard'
import { RemindersCard } from './RemindersCard'
import { useCanViewManager } from '../../lib/perms'

// My Work view — the daily worklist (frame/top bar comes from DashboardShell).
// Ready-to-Send and Follow-ups live in the Manager's "Needs your attention" area, so
// here they show only for non-managers (who don't see that dashboard). Flagged quotes,
// due follow-up reminders, and Active-quotes-this-month show for everyone in My Work.
export function MyWork() {
  const { canView } = useCanViewManager()
  return (
    <>
      {!canView && <ReadyToSendCard />}
      <FlaggedQuotesCard />
      {!canView && <FollowUpsCard />}
      <RemindersCard />
      <ActiveQuotesCard />
    </>
  )
}

import { ReadyToSendCard } from './ReadyToSendCard'
import { FlaggedQuotesCard } from './FlaggedQuotesCard'
import { FollowUpsCard } from './FollowUpsCard'
import { BadContactsCard } from './BadContactsCard'
import { ActiveQuotesCard } from './ActiveQuotesCard'
import { useCanViewManager } from '../../lib/perms'

// My Work view — the daily worklist (frame/top bar comes from DashboardShell).
// Ordered by action priority: send-ready, flagged, then follow-ups. Users without
// the Manager view also get "Active quotes this month" here, since they don't see
// the Manager tab where that card normally lives; Manager-view users see it there.
export function MyWork() {
  const { canView } = useCanViewManager()
  return (
    <>
      <ReadyToSendCard />
      <BadContactsCard />
      <FlaggedQuotesCard />
      <FollowUpsCard />
      {!canView && <ActiveQuotesCard />}
    </>
  )
}

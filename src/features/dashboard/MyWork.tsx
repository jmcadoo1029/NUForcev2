import { ReadyToSendCard } from './ReadyToSendCard'
import { FlaggedQuotesCard } from './FlaggedQuotesCard'
import { FollowUpsCard } from './FollowUpsCard'
import { ActiveQuotesCard } from './ActiveQuotesCard'
import { useIsApprover } from '../../lib/perms'

// My Work view — the daily worklist (frame/top bar comes from DashboardShell).
// Ordered by action priority: send-ready, flagged, then follow-ups. Non-managers
// also get "Active quotes this month" here, since they don't see the Manager tab
// where that card normally lives; managers see it on the Manager dashboard.
export function MyWork() {
  const { isApprover } = useIsApprover()
  return (
    <>
      <ReadyToSendCard />
      <FlaggedQuotesCard />
      <FollowUpsCard />
      {!isApprover && <ActiveQuotesCard />}
    </>
  )
}

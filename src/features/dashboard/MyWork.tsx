import { ReadyToSendCard } from './ReadyToSendCard'
import { FlaggedQuotesCard } from './FlaggedQuotesCard'
import { FollowUpsCard } from './FollowUpsCard'

// My Work view — the daily worklist (frame/top bar comes from DashboardShell).
// Ordered by action priority: send-ready, flagged, then follow-ups.
export function MyWork() {
  return (
    <>
      <ReadyToSendCard />
      <FlaggedQuotesCard />
      <FollowUpsCard />
    </>
  )
}

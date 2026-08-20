import { useEffect, useState } from 'react'
import { restFetch } from './restFetch'
import { getSessionEmail } from './auth'

// Whether the current user can approve quotes — the "manager" signal in V2.
// Resolved from employees.role_id → permission_roles.capabilities.nuforce_approve_quotes,
// matching on email OR personal_email. Fails closed (false on any error), so no
// manager UI ever flashes for a non-manager before perms resolve. Cached for the
// session so repeated checks (dashboard shell + route guard) don't re-query.

let _approverCache: boolean | null = null
let _empIdCache: string | null | undefined = undefined

/** The current user's Workspace employees.id (used as the submitter id in approval
 *  notifications). Cached for the session; null if no employee row matches. */
export async function fetchMyEmployeeId(): Promise<string | null> {
  if (_empIdCache !== undefined) return _empIdCache
  const email = getSessionEmail()
  if (!email) return null
  const safe = encodeURIComponent(email)
  try {
    const emps = await restFetch<{ id: string }[]>('GET', `employees?select=id&or=(email.eq.${safe},personal_email.eq.${safe})&limit=1`)
    _empIdCache = emps?.[0]?.id ?? null
    return _empIdCache
  } catch {
    return null // don't cache transient failures
  }
}

export async function fetchIsApprover(): Promise<boolean> {
  if (_approverCache !== null) return _approverCache
  const email = getSessionEmail()
  if (!email) return false
  const safe = encodeURIComponent(email)
  try {
    const emps = await restFetch<{ id: string; role_id: string | null }[]>('GET', `employees?select=id,role_id&or=(email.eq.${safe},personal_email.eq.${safe})&limit=1`)
    const emp = emps?.[0]
    if (!emp?.role_id) { _approverCache = false; return false }
    const roles = await restFetch<{ capabilities: Record<string, any> | null }[]>('GET', `permission_roles?select=capabilities&id=eq.${encodeURIComponent(emp.role_id)}&limit=1`)
    const ok = !!roles?.[0]?.capabilities?.nuforce_approve_quotes
    _approverCache = ok
    return ok
  } catch {
    return false // don't cache transient failures
  }
}

/** Reactive approver check: { isApprover, loading }. Gates the Manager view. */
export function useIsApprover(): { isApprover: boolean; loading: boolean } {
  const [isApprover, setIsApprover] = useState(_approverCache ?? false)
  const [loading, setLoading] = useState(_approverCache === null)
  useEffect(() => {
    if (_approverCache !== null) { setIsApprover(_approverCache); setLoading(false); return }
    let alive = true
    fetchIsApprover().then((v) => { if (alive) { setIsApprover(v); setLoading(false) } })
    return () => { alive = false }
  }, [])
  return { isApprover, loading }
}

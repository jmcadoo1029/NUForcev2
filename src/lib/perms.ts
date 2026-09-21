import { useEffect, useState } from 'react'
import { restFetch } from './restFetch'
import { getSessionEmail } from './auth'

// Role capabilities in V2. Two distinct signals:
//   nuforce_approve_quotes → full manager: sees the Manager view AND can approve.
//   nuforce_view_dashboard → view-only manager (e.g. Accounting): sees the Manager
//                            view but has no approve/reject/edit authority.
// Resolved from employees.role_id → permission_roles.capabilities, matching on
// email OR personal_email. Fails closed (false on any error) so no manager UI ever
// flashes for a non-manager before perms resolve. Cached for the session.
const CAP_APPROVE = 'nuforce_approve_quotes'
const CAP_VIEW = 'nuforce_view_dashboard'

let _capsCache: Record<string, any> | null = null
let _capsLoaded = false
let _approverCache: boolean | null = null
let _viewCache: boolean | null = null
let _empIdCache: string | null | undefined = undefined

// Per-user page/feature overrides (Users area → nuforce_user_settings.features).
// A key present as true/false overrides the role default for that feature.
let _featCache: Record<string, unknown> | null = null
let _featLoaded = false
async function loadMyFeatures(): Promise<Record<string, unknown>> {
  if (_featLoaded) return _featCache || {}
  const email = getSessionEmail()
  if (!email) return {}
  try {
    const rows = await restFetch<{ features: Record<string, unknown> | null }[]>('GET', `nuforce_user_settings?select=features&email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`)
    _featCache = rows?.[0]?.features || {}
    _featLoaded = true
  } catch {
    return {} // don't cache a transient miss — fall back to role default
  }
  return _featCache
}
const roleCanView = (caps: Record<string, any>) => !!(caps[CAP_APPROVE] || caps[CAP_VIEW])

/** Fetch (and cache for the session) the current user's role capabilities. Throws
 *  on network error so callers can fail closed WITHOUT caching a transient miss. */
async function loadCaps(): Promise<Record<string, any>> {
  if (_capsLoaded) return _capsCache || {}
  const email = getSessionEmail()
  if (!email) return {}
  const safe = encodeURIComponent(email)
  const emps = await restFetch<{ role_id: string | null }[]>('GET', `employees?select=role_id&or=(email.eq.${safe},personal_email.eq.${safe})&limit=1`)
  const roleId = emps?.[0]?.role_id
  if (!roleId) { _capsCache = {}; _capsLoaded = true; return {} }
  const roles = await restFetch<{ capabilities: Record<string, any> | null }[]>('GET', `permission_roles?select=capabilities&id=eq.${encodeURIComponent(roleId)}&limit=1`)
  _capsCache = roles?.[0]?.capabilities || {}
  _capsLoaded = true
  return _capsCache
}

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

/** Can approve quotes — the full "manager" signal (view + approve authority). */
export async function fetchIsApprover(): Promise<boolean> {
  if (_approverCache !== null) return _approverCache
  try {
    const caps = await loadCaps()
    _approverCache = !!caps[CAP_APPROVE]
    return _approverCache
  } catch {
    return false // don't cache transient failures
  }
}

/** Can see the Manager dashboard — approvers OR view-only roles (e.g. Accounting).
 *  Does NOT grant approve/edit authority; that stays gated on fetchIsApprover. */
export async function fetchCanViewManager(): Promise<boolean> {
  if (_viewCache !== null) return _viewCache
  try {
    const [caps, feats] = await Promise.all([loadCaps(), loadMyFeatures()])
    const ov = feats['manager_dashboard']
    _viewCache = typeof ov === 'boolean' ? ov : roleCanView(caps)
    return _viewCache
  } catch {
    return false // don't cache transient failures
  }
}

/** Effective access to a named page/feature: the per-user override if set, else the
 *  role default (same as manager-view: approvers + view-only roles). Used to gate the
 *  Mass Emails / Scheduled tabs independently of the overall Manager view. */
export async function fetchFeature(name: string): Promise<boolean> {
  try {
    const [caps, feats] = await Promise.all([loadCaps(), loadMyFeatures()])
    const ov = feats[name]
    return typeof ov === 'boolean' ? ov : roleCanView(caps)
  } catch {
    return false
  }
}

/** Reactive feature check. */
export function useFeature(name: string): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let alive = true
    fetchFeature(name).then((v) => { if (alive) setOn(v) })
    return () => { alive = false }
  }, [name])
  return on
}

/** Reactive approver check: { isApprover, loading }. Gates approve/edit authority. */
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

/** Reactive Manager-view check: { canView, loading }. Gates the Manager tab/route. */
export function useCanViewManager(): { canView: boolean; loading: boolean } {
  const [canView, setCanView] = useState(_viewCache ?? false)
  const [loading, setLoading] = useState(_viewCache === null)
  useEffect(() => {
    if (_viewCache !== null) { setCanView(_viewCache); setLoading(false); return }
    let alive = true
    fetchCanViewManager().then((v) => { if (alive) { setCanView(v); setLoading(false) } })
    return () => { alive = false }
  }, [])
  return { canView, loading }
}

import { restFetch } from './restFetch'
import { getSessionEmail } from './auth'

// Whether the current user can approve quotes. Resolved from
// employees.role_id → permission_roles.capabilities.nuforce_approve_quotes,
// matching on email OR personal_email. Fails closed (false on any error), so no
// approver UI ever flashes before perms resolve.
export async function fetchIsApprover(): Promise<boolean> {
  const email = getSessionEmail()
  if (!email) return false
  const safe = encodeURIComponent(email)
  try {
    const emps = await restFetch<{ id: string; role_id: string | null }[]>('GET', `employees?select=id,role_id&or=(email.eq.${safe},personal_email.eq.${safe})&limit=1`)
    const emp = emps?.[0]
    if (!emp?.role_id) return false
    const roles = await restFetch<{ capabilities: Record<string, any> | null }[]>('GET', `permission_roles?select=capabilities&id=eq.${encodeURIComponent(emp.role_id)}&limit=1`)
    return !!roles?.[0]?.capabilities?.nuforce_approve_quotes
  } catch {
    return false
  }
}

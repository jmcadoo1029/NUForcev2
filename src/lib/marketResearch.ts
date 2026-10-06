import { invokeFunction } from './workspace'

// Client for the market-research edge function (Phase 1: federal contract AWARDS
// from USASpending, matched against NUForce accounts). The edge function holds all
// the logic + caching; this just calls it with the caller's session token.

export interface MarketItem {
  id: string
  source: string
  source_id: string
  kind: 'award' | 'solicitation' | string
  title: string | null
  agency: string | null
  sub_agency?: string | null
  naics: string | null
  psc: string | null
  amount: number | null
  posted_date?: string | null
  response_deadline?: string | null
  company_name: string | null
  company_city?: string | null
  company_state?: string | null
  company_website?: string | null
  url: string | null
  matched_client_id: string | null
  match_kind: 'account' | 'contact' | 'prospect' | string | null
  family: string | null
  status: 'new' | 'reviewing' | 'interested' | 'dismissed' | string
  assigned_to: string | null
  first_seen_at: string
  last_seen_at: string
  raw?: Record<string, any> | null // full source record (SAM.gov / USASpending)
}

export interface MarketSearchParams {
  kind?: 'award' | 'solicitation'
  agencyScope?: 'dod' | 'all'
  monthsBack?: number
  keyword?: string
  family?: string
}

// The test families the edge function tags (keys) → friendly labels for the UI.
export const FAMILY_LABELS: Record<string, string> = {
  shock: 'Shock',
  vibration: 'Vibration',
  emi_emc: 'EMI / EMC',
  power_quality: 'Power Quality',
  dc_magnetics: 'DC Magnetics',
  temp_humidity: 'Temp / Humidity',
  altitude: 'Altitude / Decompression',
  salt_fog: 'Salt Fog',
  water_ingress: 'Water Ingress',
  hydrostatic: 'Hydrostatic / Pressure',
  noise: 'Airborne / Structureborne Noise',
  shielding: 'Shielding Effectiveness',
  dielectric: 'Insulation / Dielectric',
  ess: 'ESS',
  acceleration: 'Acceleration',
  environmental: 'Environmental / Qual',
}

export async function searchMarket(p: MarketSearchParams = {}): Promise<MarketItem[]> {
  const res = await invokeFunction<{ ok: boolean; items?: MarketItem[]; error?: string }>('market-research', {
    action: 'search',
    kind: p.kind || 'award',
    agencyScope: p.agencyScope || 'dod',
    monthsBack: p.monthsBack || 12,
    keyword: p.keyword || '',
    family: p.family || '',
  })
  if (!res?.ok) throw new Error(res?.error || 'Market search failed.')
  return res.items || []
}

export async function updateOpportunity(id: string, patch: { status?: string; assigned_to?: string | null }): Promise<void> {
  const res = await invokeFunction<{ ok: boolean; error?: string }>('market-research', { action: 'update', id, ...patch })
  if (!res?.ok) throw new Error(res?.error || 'Update failed.')
}

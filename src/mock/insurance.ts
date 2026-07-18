// Mock insurance data — not in Supabase, frontend-only for now

export interface InsuranceCompany {
  id: string
  nameAr: string
  nameEn: string
}

export interface InsuranceUser {
  company_id: string
  password: string
  assigned_workshop_ids: string[]
}

export const INSURANCE_COMPANIES: InsuranceCompany[] = [
  { id: 'ins-001', nameAr: 'شركة جي فاست للتأمين', nameEn: 'G-Fast Insurance Co.' },
]

const INSURANCE_USERS: InsuranceUser[] = [
  { company_id: 'ins-001', password: '4321', assigned_workshop_ids: ['workshop-001'] },
]

export function authenticateInsurance(
  company_id: string,
  password: string
): (InsuranceUser & InsuranceCompany) | null {
  const user = INSURANCE_USERS.find(
    (u) => u.company_id.toLowerCase() === company_id.toLowerCase() && u.password === password
  )
  if (!user) return null
  const company = INSURANCE_COMPANIES.find((c) => c.id === user.company_id)
  if (!company) return null
  return { ...user, ...company }
}

export function getInsuranceSession(): (InsuranceUser & InsuranceCompany) | null {
  try {
    const raw = localStorage.getItem('insurance_session')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearInsuranceSession() {
  localStorage.removeItem('insurance_session')
}

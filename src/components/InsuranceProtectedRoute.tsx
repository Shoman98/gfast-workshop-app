import { Navigate, Outlet } from 'react-router-dom'
import { getInsuranceSession } from '@/mock/insurance'

export default function InsuranceProtectedRoute() {
  const session = getInsuranceSession()
  if (!session) return <Navigate to="/insurance/login" replace />
  return <Outlet />
}

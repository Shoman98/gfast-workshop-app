import { Navigate, Outlet } from 'react-router-dom'

export function getBrokerSession(): { token: string; broker: { id: string; name: string; company: string; email: string; link_token: string } } | null {
  try {
    const raw = localStorage.getItem('broker_session')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearBrokerSession() {
  localStorage.removeItem('broker_session')
}

export default function BrokerProtectedRoute() {
  const session = getBrokerSession()
  if (!session) return <Navigate to="/broker/login" replace />
  return <Outlet />
}

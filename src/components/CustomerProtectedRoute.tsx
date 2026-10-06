import { Navigate, Outlet } from 'react-router-dom'

export default function CustomerProtectedRoute() {
  const session = localStorage.getItem('customer_session')
  if (!session) return <Navigate to="/login" replace />
  try {
    const { token } = JSON.parse(session)
    if (!token) return <Navigate to="/login" replace />
  } catch {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

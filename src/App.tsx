import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import LoginPage from '@/pages/Login'
import DashboardPage from '@/pages/Dashboard'
import AnalysisPage from '@/pages/Analysis'
import EstimatePage from '@/pages/Estimate'
import ReportPage from '@/pages/Report'
import ProtectedRoute from '@/components/ProtectedRoute'

function useTokenRefresh() {
  useEffect(() => {
    const refresh = async () => {
      const token = localStorage.getItem('token')
      if (!token) return

      try {
        // Decode expiry from JWT (base64)
        const payload = JSON.parse(atob(token.split('.')[1]))
        const expiresIn = payload.exp * 1000 - Date.now()

        // Refresh if less than 2 hours remaining
        if (expiresIn < 2 * 60 * 60 * 1000) {
          const res = await fetch(apiUrl('/api/auth/refresh'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) {
            const data = await res.json()
            localStorage.setItem('token', data.token)
          } else {
            // Token expired and refresh failed — redirect to login
            localStorage.clear()
            window.location.href = '/login'
          }
        }
      } catch {
        // Invalid token format
        localStorage.clear()
        window.location.href = '/login'
      }
    }

    refresh()
    // Check every 30 minutes
    const interval = setInterval(refresh, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])
}

export default function App() {
  useTokenRefresh()
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/estimate/:estimateId" element={<EstimatePage />} />
          <Route path="/report/:estimateId" element={<ReportPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  )
}

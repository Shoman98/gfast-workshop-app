import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import LoginPage from '@/pages/Login'
import DashboardPage from '@/pages/Dashboard'
import AnalysisPage from '@/pages/Analysis'
import EstimatePage from '@/pages/Estimate'
import ReportPage from '@/pages/Report'
import NegotiateReview from '@/pages/NegotiateReview'
import CounterOfferPage from '@/pages/CounterOfferPage'
import SupplementaryPage from '@/pages/SupplementaryPage'
import PricingPage from '@/pages/PricingPage'
import AuditTrailPage from '@/pages/AuditTrailPage'
import ProtectedRoute from '@/components/ProtectedRoute'
import InsuranceLoginPage from '@/pages/InsuranceLogin'
import InsuranceDashboard from '@/pages/InsuranceDashboard'
import InsuranceClaimDetail from '@/pages/InsuranceClaimDetail'
import InsuranceProtectedRoute from '@/components/InsuranceProtectedRoute'

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
          <Route path="/estimate/:estimateId/negotiate" element={<NegotiateReview />} />
          <Route path="/estimate/:estimateId/counter-offer" element={<CounterOfferPage />} />
          <Route path="/estimate/:estimateId/supplements" element={<SupplementaryPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/estimate/:estimateId/audit" element={<AuditTrailPage />} />
        </Route>
        {/* Insurance routes */}
        <Route path="/insurance/login" element={<Navigate to="/login" replace />} />
        <Route element={<InsuranceProtectedRoute />}>
          <Route path="/insurance/dashboard" element={<InsuranceDashboard />} />
          <Route path="/insurance/claim/:estimateId" element={<InsuranceClaimDetail />} />
          <Route path="/insurance/assessment" element={<AnalysisPage />} />
          <Route path="/insurance/estimate/:estimateId" element={<EstimatePage />} />
          <Route path="/insurance/report/:estimateId" element={<ReportPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  )
}

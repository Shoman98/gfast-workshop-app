import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from '@/contexts/LanguageContext'
import LoginPage from '@/pages/Login'
import DashboardPage from '@/pages/Dashboard'
import AnalysisPage from '@/pages/Analysis'
import EstimatePage from '@/pages/Estimate'
import ProtectedRoute from '@/components/ProtectedRoute'

export default function App() {
  return (
    <LanguageProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/estimate/:estimateId" element={<EstimatePage />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </LanguageProvider>
  )
}

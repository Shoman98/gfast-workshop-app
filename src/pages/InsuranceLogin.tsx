import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authenticateInsurance } from '@/mock/insurance'

export default function InsuranceLoginPage() {
  const navigate = useNavigate()
  const [companyId, setCompanyId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!companyId || !password) {
      setError('يرجى إدخال رقم الشركة وكلمة المرور')
      return
    }
    setLoading(true)
    const session = authenticateInsurance(companyId, password)
    if (!session) {
      setError('بيانات غير صحيحة')
      setLoading(false)
      return
    }
    localStorage.setItem('insurance_session', JSON.stringify(session))
    navigate('/insurance/dashboard')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem 1rem',
    border: '2px solid #d1d5db',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    outline: 'none',
    boxSizing: 'border-box',
    textAlign: 'right',
    direction: 'rtl',
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '1rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', padding: '2.5rem', width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #1e40af, #3b82f6)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.6rem' }}>🏦</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', margin: 0 }}>بوابة شركات التأمين</h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.5rem' }}>G-FAST Insurance Portal</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              رقم الشركة
            </label>
            <input
              style={inputStyle}
              type="text"
              placeholder="ins-001"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              كلمة المرور
            </label>
            <input
              style={inputStyle}
              type="password"
              placeholder="••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '0.875rem', backgroundColor: '#1e40af', color: 'white', border: 'none', borderRadius: '0.5rem', fontSize: '1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'background .2s' }}
          >
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>للتجربة: ins-001 / 4321</p>
        </div>
      </div>
    </div>
  )
}

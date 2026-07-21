import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import { authenticateInsurance } from '@/mock/insurance'

type Role = 'workshop' | 'insurance'

export default function LoginPage() {
  const navigate = useNavigate()
  const [role, setRole] = useState<Role | null>(null)

  // Workshop fields
  const [workshopId, setWorkshopId] = useState('')
  const [pin, setPin] = useState('')

  // Insurance fields
  const [companyId, setCompanyId] = useState('')
  const [password, setPassword] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const reset = (newRole: Role) => {
    setRole(newRole)
    setError('')
    setWorkshopId(''); setPin(''); setCompanyId(''); setPassword('')
  }

  const handleWorkshopLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!workshopId || !pin) { setError('يرجى إدخال رقم الورشة والرمز السري'); return }
    setLoading(true)
    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: workshopId, pin }),
      })
      const data = await response.json()
      if (!response.ok) { setError(data.error || 'فشل تسجيل الدخول'); setLoading(false); return }
      localStorage.setItem('token', data.token)
      localStorage.setItem('workshop', JSON.stringify(data.workshop))
      navigate('/dashboard')
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  const handleInsuranceLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!companyId || !password) { setError('يرجى إدخال رقم الشركة وكلمة المرور'); return }
    const session = authenticateInsurance(companyId, password)
    if (!session) { setError('بيانات غير صحيحة'); return }
    localStorage.setItem('insurance_session', JSON.stringify(session))
    navigate('/insurance/dashboard')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem 1rem',
    border: '2px solid #d1d5db',
    borderRadius: '0.5rem',
    textAlign: 'right',
    fontSize: '1rem',
    outline: 'none',
    boxSizing: 'border-box',
    direction: 'rtl',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      direction: 'rtl',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.8rem', fontWeight: 800, color: 'white', margin: 0, letterSpacing: '-1px' }}>G-Fast</h1>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.95rem', marginTop: '0.5rem' }}>منصة تقييم أضرار المركبات</p>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '1.25rem', boxShadow: '0 24px 48px rgba(0,0,0,.2)', overflow: 'hidden' }}>

          {/* Role selector */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e5e7eb' }}>
            {([
              { key: 'workshop' as Role, label: 'ورشة', icon: '🔧' },
              { key: 'insurance' as Role, label: 'شركة تأمين', icon: '🏦' },
            ]).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => reset(key)}
                style={{
                  padding: '1.25rem',
                  border: 'none',
                  background: role === key ? '#eff6ff' : 'white',
                  color: role === key ? '#1e40af' : '#6b7280',
                  fontWeight: role === key ? 700 : 500,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  borderBottom: role === key ? '2px solid #2563eb' : '2px solid transparent',
                  transition: 'all .15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>

          <div style={{ padding: '2rem' }}>
            {/* No role selected yet */}
            {!role && (
              <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.9rem', margin: '1rem 0' }}>
                اختر نوع الحساب للمتابعة
              </p>
            )}

            {/* Error */}
            {error && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.875rem' }}>
                ⚠️ {error}
              </div>
            )}

            {/* Workshop form */}
            {role === 'workshop' && (
              <form onSubmit={handleWorkshopLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>رقم الورشة</label>
                  <input
                    style={inputStyle}
                    type="text"
                    placeholder="مثال: workshop-001"
                    value={workshopId}
                    onChange={e => setWorkshopId(e.target.value)}
                    disabled={loading}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#d1d5db')}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>الرمز السري</label>
                  <input
                    style={inputStyle}
                    type="password"
                    placeholder="••••"
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    disabled={loading}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#d1d5db')}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ padding: '0.875rem', background: loading ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '0.25rem' }}
                >
                  {loading ? 'جاري الدخول...' : '🔐 دخول'}
                </button>
              </form>
            )}

            {/* Insurance form */}
            {role === 'insurance' && (
              <form onSubmit={handleInsuranceLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>رقم الشركة</label>
                  <input
                    style={inputStyle}
                    type="text"
                    placeholder="ins-001"
                    value={companyId}
                    onChange={e => setCompanyId(e.target.value)}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#d1d5db')}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>كلمة المرور</label>
                  <input
                    style={inputStyle}
                    type="password"
                    placeholder="••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={e => (e.target.style.borderColor = '#2563eb')}
                    onBlur={e => (e.target.style.borderColor = '#d1d5db')}
                  />
                </div>
                <button
                  type="submit"
                  style={{ padding: '0.875rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginTop: '0.25rem' }}
                >
                  🏦 دخول
                </button>
              </form>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.4)', fontSize: '0.75rem', marginTop: '1.5rem' }}>G-Fast · V.01</p>
      </div>
    </div>
  )
}

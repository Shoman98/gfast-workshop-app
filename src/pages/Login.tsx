import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import { authenticateInsurance } from '@/mock/insurance'

type Role = 'workshop' | 'insurance'

type Branch = { branch_id: string; branch_name: string; city?: string; phone?: string }
type WorkshopChoice = { workshop_id: string; workshop_name: string; city?: string }

export default function LoginPage() {
  const navigate = useNavigate()
  const [role, setRole] = useState<Role | null>(null)

  // Workshop fields
  const [workshopId, setWorkshopId] = useState('')
  const [pin, setPin] = useState('')

  // Workshop selection step (owner account owns multiple workshops)
  const [workshops, setWorkshops] = useState<WorkshopChoice[]>([])
  const [accountToken, setAccountToken] = useState('')

  // Branch selection step
  const [branches, setBranches] = useState<Branch[]>([])
  const [pendingWorkshop, setPendingWorkshop] = useState<any>(null)

  // Insurance fields
  const [companyId, setCompanyId] = useState('')
  const [password, setPassword] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const reset = (newRole: Role) => {
    setRole(newRole)
    setError('')
    setWorkshops([])
    setAccountToken('')
    setBranches([])
    setPendingWorkshop(null)
    setWorkshopId(''); setPin(''); setCompanyId(''); setPassword('')
  }

  // Apply a successful auth response: either finish (token) or advance to the
  // branch picker. Shared by account-login, workshop-select and branch-select.
  const applyAuthResult = (data: any): boolean => {
    if (data.requires_branch_selection) {
      setBranches(data.branches)
      setPendingWorkshop(data.workshop)
      setLoading(false)
      return true
    }
    if (data.token) {
      localStorage.setItem('token', data.token)
      localStorage.setItem('workshop', JSON.stringify(data.workshop))
      navigate('/dashboard')
      return true
    }
    return false
  }

  const handleWorkshopLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!workshopId || !pin) { setError('يرجى إدخال اسم الحساب والرمز السري'); return }
    setLoading(true)
    try {
      const response = await fetch(apiUrl('/api/auth/account-login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: workshopId.trim(), pin }),
      })
      const data = await response.json()
      if (!response.ok) { setError(data.error || 'فشل تسجيل الدخول'); setLoading(false); return }

      if (data.requires_workshop_selection) {
        // Owner account owns several workshops — show workshop picker
        setWorkshops(data.workshops)
        setAccountToken(data.account_token)
        setLoading(false)
        return
      }

      if (!applyAuthResult(data)) { setError('فشل تسجيل الدخول'); setLoading(false) }
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  const handleWorkshopSelect = async (ws: WorkshopChoice) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(apiUrl('/api/auth/select-workshop'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_token: accountToken, workshop_id: ws.workshop_id }),
      })
      const data = await response.json()
      if (!response.ok) { setError(data.error || 'فشل اختيار الورشة'); setLoading(false); return }
      if (!applyAuthResult(data)) { setError('فشل اختيار الورشة'); setLoading(false) }
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  const handleBranchSelect = async (branch: Branch) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(apiUrl('/api/auth/select-branch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: pendingWorkshop.workshop_id, branch_id: branch.branch_id }),
      })
      const data = await response.json()
      if (!response.ok) { setError(data.error || 'فشل اختيار الفرع'); setLoading(false); return }
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

            {/* Workshop picker (shown when an owner account owns multiple workshops) */}
            {role === 'workshop' && workshops.length > 0 && branches.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', margin: 0 }}>اختر الورشة</p>
                  <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0.25rem 0 0' }}>لديك أكثر من ورشة على هذا الحساب</p>
                </div>
                {workshops.map(ws => (
                  <button
                    key={ws.workshop_id}
                    onClick={() => handleWorkshopSelect(ws)}
                    disabled={loading}
                    style={{
                      width: '100%', padding: '0.9rem 1rem', border: '2px solid #e5e7eb',
                      borderRadius: '0.6rem', background: 'white', cursor: loading ? 'not-allowed' : 'pointer',
                      textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.2rem',
                      transition: 'border-color .15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563eb')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
                  >
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>🔧 {ws.workshop_name}</span>
                    {ws.city && <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>📍 {ws.city}</span>}
                  </button>
                ))}
                <button
                  onClick={() => { setWorkshops([]); setAccountToken('') }}
                  style={{ padding: '0.5rem', background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  رجوع
                </button>
              </div>
            )}

            {/* Branch picker (shown after credentials when workshop has multiple branches) */}
            {role === 'workshop' && branches.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', margin: 0 }}>{pendingWorkshop?.workshop_name}</p>
                  <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0.25rem 0 0' }}>اختر الفرع للمتابعة</p>
                </div>
                {branches.map(branch => (
                  <button
                    key={branch.branch_id}
                    onClick={() => handleBranchSelect(branch)}
                    disabled={loading}
                    style={{
                      width: '100%', padding: '0.9rem 1rem', border: '2px solid #e5e7eb',
                      borderRadius: '0.6rem', background: 'white', cursor: loading ? 'not-allowed' : 'pointer',
                      textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.2rem',
                      transition: 'border-color .15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563eb')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
                  >
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>🏢 {branch.branch_name}</span>
                    {branch.city && <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>📍 {branch.city}</span>}
                  </button>
                ))}
                <button
                  onClick={() => { setBranches([]); setPendingWorkshop(null) }}
                  style={{ padding: '0.5rem', background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  رجوع
                </button>
              </div>
            )}

            {/* Workshop credentials form */}
            {role === 'workshop' && workshops.length === 0 && branches.length === 0 && (
              <form onSubmit={handleWorkshopLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>اسم الحساب أو رقم الورشة</label>
                  <input
                    style={inputStyle}
                    type="text"
                    placeholder="مثال: elmohandes01"
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

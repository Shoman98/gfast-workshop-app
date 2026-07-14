import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const [workshopId, setWorkshopId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!workshopId || !pin) {
      setError('يرجى إدخال رقم الورشة والرمز السري')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: workshopId, pin }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'فشل تسجيل الدخول')
        setLoading(false)
        return
      }

      localStorage.setItem('token', data.token)
      localStorage.setItem('workshop', JSON.stringify(data.workshop))
      navigate('/dashboard')
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '0.75rem 1rem',
    border: '2px solid #d1d5db',
    borderRadius: '0.5rem',
    textAlign: 'right' as const,
    fontSize: '1.125rem',
    outline: 'none',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(to bottom right, #2563eb, #1e40af)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      direction: 'rtl',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '28rem',
        backgroundColor: 'white',
        borderRadius: '1rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        padding: '2rem',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 'bold', color: '#2563eb', marginBottom: '0.5rem' }}>
            G-Fast
          </h1>
          <p style={{ color: '#4b5563', fontSize: '1.125rem', fontWeight: '500' }}>
            منصة تقييم أضرار المركبات
          </p>
        </div>

        {error && (
          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: '#fee2e2',
            borderRight: '4px solid #ef4444',
            borderRadius: '0.5rem',
            color: '#991b1b',
            fontSize: '0.875rem',
            fontWeight: '500',
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>
              رقم الورشة
            </label>
            <input
              type="text"
              value={workshopId}
              onChange={(e) => setWorkshopId(e.target.value)}
              placeholder="مثال: WS-001"
              disabled={loading}
              style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = '#2563eb'}
              onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>
              الرمز السري
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              disabled={loading}
              style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = '#2563eb'}
              onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: loading ? '#9ca3af' : '#2563eb',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              fontWeight: 'bold',
              fontSize: '1.125rem',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '0.5rem',
            }}
          >
            {loading ? '⏳ جاري التحميل...' : '🔐 دخول'}
          </button>
        </form>

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>G-Fast • V.01</p>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

function getSession() {
  try { return JSON.parse(localStorage.getItem('customer_session') || '{}') } catch { return {} }
}
function authHeader() {
  return { Authorization: `Bearer ${getSession().token || ''}`, 'Content-Type': 'application/json' }
}

export default function ReportClaimPage() {
  const { policyId } = useParams()
  const navigate = useNavigate()
  const [claimType, setClaimType] = useState('')
  const [description, setDescription] = useState('')
  const [accidentDate, setAccidentDate] = useState('')
  const [accidentLocation, setAccidentLocation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!claimType || !accidentDate) { setError('اختر نوع المطالبة والتاريخ'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(apiUrl('/api/claims/report'), {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
          policy_id: policyId,
          claim_type: claimType,
          description,
          accident_date: accidentDate,
          accident_location: accidentLocation,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل تقديم المطالبة')
      navigate(`/customer/claim/${data.claim_id}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const page: React.CSSProperties = {
    minHeight: '100dvh', background: '#f8fafc', direction: 'rtl',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }

  const claimTypes = [
    { code: 'accident', label: 'حادث', emoji: '🚗' },
    { code: 'theft', label: 'سرقة', emoji: '🚨' },
    { code: 'fire', label: 'حريق', emoji: '🔥' },
    { code: 'flood', label: 'فيضان', emoji: '💧' },
  ]

  return (
    <div style={page}>
      <div style={{ background: '#1e3a8a', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: 1 }}>G-FAST</span>
        <button onClick={() => navigate('/customer/dashboard')} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: '.82rem' }}>← رجوع</button>
      </div>

      <div style={{ maxWidth: 580, margin: 'clamp(20px,5vw,40px) auto', padding: '0 clamp(12px,4vw,16px)', width: '100%', boxSizing: 'border-box' }}>
        <h1 style={{ fontWeight: 800, fontSize: '1.4rem', color: '#0f172a', marginBottom: 6 }}>تقديم مطالبة تأمينية</h1>
        <p style={{ color: '#64748b', fontSize: '.9rem', marginBottom: 28 }}>
          أخبرنا عن الحادثة لتقييم مطالبتك
        </p>

        {error && (
          <div style={{ marginBottom: 16, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '.88rem' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Claim type selection */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>نوع المطالبة *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {claimTypes.map(t => (
              <button key={t.code} onClick={() => { setClaimType(t.code); setError('') }}
                style={{
                  padding: '14px', borderRadius: 10, border: claimType === t.code ? '2px solid #1e3a8a' : '2px solid #e2e8f0',
                  background: claimType === t.code ? '#eff6ff' : '#fff', cursor: 'pointer', transition: 'all .15s',
                  fontWeight: claimType === t.code ? 700 : 600, color: claimType === t.code ? '#1e3a8a' : '#0f172a',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                <span style={{ fontSize: '1.6rem' }}>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 700, color: '#0f172a', marginBottom: 6, fontSize: '.9rem' }}>تاريخ الحادث *</label>
          <input type="date" value={accidentDate} onChange={e => setAccidentDate(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #d1d5db', borderRadius: 8, fontSize: '.9rem', direction: 'ltr' }} />
        </div>

        {/* Location */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 700, color: '#0f172a', marginBottom: 6, fontSize: '.9rem' }}>مكان الحادث</label>
          <input type="text" value={accidentLocation} onChange={e => setAccidentLocation(e.target.value)} placeholder="المدينة، الشارع"
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #d1d5db', borderRadius: 8, fontSize: '.9rem' }} />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 700, color: '#0f172a', marginBottom: 6, fontSize: '.9rem' }}>وصف الحادثة</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="اشرح ما حدث بالتفصيل…" rows={4}
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #d1d5db', borderRadius: 8, fontSize: '.9rem', fontFamily: 'inherit', resize: 'none' }} />
        </div>

        <button onClick={submit} disabled={loading}
          style={{
            width: '100%', padding: '12px', background: loading || !claimType ? '#9ca3af' : '#1e3a8a',
            color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.95rem',
            cursor: loading || !claimType ? 'not-allowed' : 'pointer',
          }}>
          {loading ? '⏳ جاري التقديم…' : '📤 تقديم المطالبة'}
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('broker_session') && JSON.parse(localStorage.getItem('broker_session') || '{}').token || ''}`, 'Content-Type': 'application/json' }
}

const STATUS_AR = { reported: 'مقدم', triaging: 'قيد الفحص', valid: 'مقبول', not_valid: 'مرفوض', needs_docs: 'يحتاج معلومات' }
const STATUS_COLOR = { reported: '#3b82f6', triaging: '#1d4ed8', valid: '#15803d', not_valid: '#b91c1c', needs_docs: '#f59e0b' }
const STATUS_BG = { reported: '#eff6ff', triaging: '#dbeafe', valid: '#f0fdf4', not_valid: '#fef2f2', needs_docs: '#fffbeb' }

export default function InsurerClaimsListPage() {
  const { insurerId } = useParams()
  const navigate = useNavigate()
  const [claims, setClaims] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(apiUrl(`/api/insurer/${insurerId}/claims`), { headers: authHeader() })
      .then(r => r.json())
      .then(d => { setClaims(d.claims || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [insurerId])

  const page: React.CSSProperties = {
    minHeight: '100dvh', background: '#f8fafc', direction: 'rtl',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }

  return (
    <div style={page}>
      <div style={{ background: '#1e3a8a', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: 1 }}>G-FAST</span>
        <button onClick={() => navigate('/broker/dashboard')} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: '.82rem' }}>← لوحة التحكم</button>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(16px,4vw,28px) clamp(12px,4vw,20px)' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontWeight: 800, fontSize: '1.3rem', color: '#0f172a', marginBottom: 6 }}>المطالبات</h1>
          <p style={{ color: '#64748b', fontSize: '.9rem', margin: 0 }}>
            جميع المطالبات المقدمة من العملاء
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>جاري التحميل…</div>
        ) : claims.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.1rem' }}>لا توجد مطالبات</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {claims.map(c => (
              <div key={c.id} onClick={() => navigate(`/claims/${c.id}`)}
                style={{ background: '#fff', borderRadius: 14, padding: '18px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', cursor: 'pointer', border: '1.5px solid #e2e8f0', transition: 'border-color .15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#1e3a8a')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#0f172a' }}>
                      {c.claim_type === 'accident' ? '🚗 حادث' : c.claim_type === 'theft' ? '🚨 سرقة' : c.claim_type === 'fire' ? '🔥 حريق' : '💧 فيضان'}
                    </div>
                    {c.raw_fnol_data?.fnol_id && (
                      <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                        FNOL ID: {c.raw_fnol_data.fnol_id}
                      </div>
                    )}
                    {c.raw_policy_data?.policy_number && (
                      <div style={{ fontSize: '.78rem', color: '#64748b' }}>
                        📋 {c.raw_policy_data.policy_number}
                      </div>
                    )}
                    {c.raw_driver_data?.name && (
                      <div style={{ fontSize: '.78rem', color: '#64748b' }}>
                        👤 {c.raw_driver_data.name}
                      </div>
                    )}
                  </div>
                  <span style={{
                    flexShrink: 0, padding: '4px 10px', borderRadius: 999, fontSize: '.72rem', fontWeight: 700,
                    background: STATUS_BG[c.status as keyof typeof STATUS_BG] || '#f8fafc',
                    color: STATUS_COLOR[c.status as keyof typeof STATUS_COLOR] || '#374151'
                  }}>
                    {STATUS_AR[c.status as keyof typeof STATUS_AR] || c.status}
                  </span>
                </div>
                <div style={{ marginTop: 10, fontSize: '.75rem', color: '#94a3b8' }}>
                  {c.created_at && new Date(c.created_at).toLocaleDateString('ar-EG')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

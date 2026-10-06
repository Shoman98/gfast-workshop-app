import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

function getSession() {
  try { return JSON.parse(localStorage.getItem('customer_session') || '{}') } catch { return {} }
}
function authHeader() {
  return { Authorization: `Bearer ${getSession().token || ''}`, 'Content-Type': 'application/json' }
}

const STATUS_AR: Record<string, string> = {
  pending: 'في الانتظار', extracting: 'جاري الاستخراج', extracted: 'مكتمل', failed: 'فشل'
}
const STATUS_COLOR: Record<string, string> = {
  pending: '#92400e', extracting: '#1d4ed8', extracted: '#15803d', failed: '#b91c1c'
}
const STATUS_BG: Record<string, string> = {
  pending: '#fffbeb', extracting: '#eff6ff', extracted: '#f0fdf4', failed: '#fef2f2'
}

export default function CustomerDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'policies' | 'claims'>('policies')
  const [policies, setPolicies] = useState<any[]>([])
  const [claims, setClaims] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const customer = getSession().customer || {}

  useEffect(() => {
    Promise.all([
      fetch(apiUrl('/api/customer/policies'), { headers: authHeader() }).then(r => r.json()),
      fetch(apiUrl('/api/claims'), { headers: authHeader() }).then(r => r.json()),
    ])
      .then(([policyData, claimData]) => {
        setPolicies(policyData.policies || [])
        setClaims(claimData.claims || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const logout = () => { localStorage.removeItem('customer_session'); navigate('/login') }

  const page: React.CSSProperties = {
    minHeight: '100dvh', background: '#f8fafc', direction: 'rtl',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ background: '#1e3a8a', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: 1 }}>G-FAST</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'rgba(255,255,255,.8)', fontSize: '.85rem' }}>{customer.full_name || customer.email}</span>
          <button onClick={logout} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: '.82rem' }}>خروج</button>
        </div>
      </div>

      <style>{`
        @media (max-width: 600px) {
          .cd-header-row { flex-direction: column !important; gap: 12px !important; align-items: flex-start !important; }
          .cd-upload-btn { width: 100% !important; }
          .cd-coverage-tags { gap: 4px !important; }
        }
      `}</style>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(16px,4vw,28px) clamp(12px,4vw,20px)' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
          {[{ key: 'policies' as const, label: '📋 وثائق', emoji: '📄' }, { key: 'claims' as const, label: '🔍 مطالبات', emoji: '📝' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: '12px 16px', border: 'none', background: 'transparent', fontWeight: tab === t.key ? 700 : 600,
                color: tab === t.key ? '#1e3a8a' : '#94a3b8', borderBottom: tab === t.key ? '3px solid #1e3a8a' : 'none',
                cursor: 'pointer', fontSize: '.9rem', transition: 'all .15s',
              }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* Policies tab */}
        {tab === 'policies' && (
          <>
            <div className="cd-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>وثائق التأمين</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '.85rem' }}>رفع وتحليل وثائقك</p>
              </div>
              <button onClick={() => navigate('/customer/policy/upload')} className="cd-upload-btn"
                style={{ padding: '10px 22px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.9rem', cursor: 'pointer' }}>
                + رفع
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>جاري التحميل…</div>
            ) : policies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📄</div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.1rem' }}>لا توجد وثائق بعد</div>
            <div style={{ color: '#64748b', marginTop: 6, fontSize: '.9rem' }}>ارفع وثيقة التأمين الخاصة بك لتحليلها</div>
            <button onClick={() => navigate('/customer/policy/upload')}
              style={{ marginTop: 20, padding: '10px 28px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
              رفع وثيقة الآن
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {policies.map(p => {
              const pd = p.policy_data?.[0]
              return (
                <div key={p.id} onClick={() => navigate(`/customer/policy/${p.id}`)}
                  style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', cursor: 'pointer', border: '1.5px solid #e2e8f0', transition: 'border-color .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#1e3a8a')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
                        {p.insurer || 'شركة التأمين'} {p.policy_number ? `— ${p.policy_number}` : ''}
                      </div>
                      {pd && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.82rem', color: '#64748b' }}>
                          {pd.vehicle_make && <span>🚗 {pd.vehicle_year} {pd.vehicle_make} {pd.vehicle_model}</span>}
                          {pd.insured_name && <span>👤 {pd.insured_name}</span>}
                          {pd.expiry_date && <span>📅 تنتهي: {new Date(pd.expiry_date).toLocaleDateString('ar-EG')}</span>}
                          {pd.sum_insured && <span>💰 {Number(pd.sum_insured).toLocaleString()} ج.م</span>}
                        </div>
                      )}
                      {pd && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {[['حوادث', pd.coverage_collision], ['سرقة', pd.coverage_theft], ['حريق', pd.coverage_fire], ['زجاج', pd.coverage_glass], ['فيضان', pd.coverage_flood], ['ضد الغير', pd.coverage_tpl]]
                            .filter(([, v]) => v).map(([label]) => (
                              <span key={label as string} style={{ padding: '2px 10px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 999, fontSize: '.72rem', fontWeight: 700 }}>{label as string}</span>
                            ))}
                        </div>
                      )}
                    </div>
                    <span style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 999, fontSize: '.78rem', fontWeight: 700, background: STATUS_BG[p.status] || '#f8fafc', color: STATUS_COLOR[p.status] || '#374151' }}>
                      {STATUS_AR[p.status] || p.status}
                    </span>
                  </div>
                  <div style={{ marginTop: 10, fontSize: '.75rem', color: '#94a3b8' }}>
                    رُفعت {new Date(p.created_at).toLocaleDateString('ar-EG')}
                  </div>
                </div>
              )
            })}
          </div>
            )}
          </>
        )}

        {/* Claims tab */}
        {tab === 'claims' && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>مطالباتك</h2>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '.85rem' }}>تتبع حالة مطالبات التأمين</p>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>جاري التحميل…</div>
            ) : claims.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>📝</div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.1rem' }}>لا توجد مطالبات بعد</div>
                <div style={{ color: '#64748b', marginTop: 6, fontSize: '.9rem' }}>اختر وثيقة لتقديم مطالبة تأمينية</div>
                <button onClick={() => setTab('policies')}
                  style={{ marginTop: 20, padding: '10px 28px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                  عرض الوثائق
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {claims.map(c => {
                  const triage = c.claim_triage?.[0]
                  const verdictColor = triage?.verdict === 'valid' ? '#15803d' : triage?.verdict === 'not_valid' ? '#b91c1c' : '#f59e0b'
                  const verdictBg = triage?.verdict === 'valid' ? '#f0fdf4' : triage?.verdict === 'not_valid' ? '#fef2f2' : '#fffbeb'
                  const verdictEmoji = triage?.verdict === 'valid' ? '✅' : triage?.verdict === 'not_valid' ? '❌' : '⚠️'
                  return (
                    <div key={c.id} onClick={() => navigate(`/customer/claim/${c.id}`)}
                      style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', cursor: 'pointer', border: '1.5px solid #e2e8f0', transition: 'border-color .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#1e3a8a')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {c.claim_type === 'accident' ? '🚗' : c.claim_type === 'theft' ? '🚨' : c.claim_type === 'fire' ? '🔥' : '💧'}
                            {c.claim_type === 'accident' ? 'حادث' : c.claim_type === 'theft' ? 'سرقة' : c.claim_type === 'fire' ? 'حريق' : 'فيضان'}
                          </div>
                          {c.accident_date && (
                            <div style={{ marginTop: 8, fontSize: '.82rem', color: '#64748b' }}>
                              📅 {new Date(c.accident_date).toLocaleDateString('ar-EG')}
                              {c.accident_location && ` • 📍 ${c.accident_location}`}
                            </div>
                          )}
                          {triage && (
                            <div style={{ marginTop: 8, fontSize: '.82rem', color: '#64748b' }}>
                              {triage.verdict_summary}
                            </div>
                          )}
                        </div>
                        {triage && (
                          <span style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 999, fontSize: '.78rem', fontWeight: 700, background: verdictBg, color: verdictColor }}>
                            {verdictEmoji}
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 10, fontSize: '.75rem', color: '#94a3b8' }}>
                        قُدمت {new Date(c.created_at).toLocaleDateString('ar-EG')}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

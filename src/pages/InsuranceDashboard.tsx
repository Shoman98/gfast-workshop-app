import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getInsuranceSession, clearInsuranceSession } from '@/mock/insurance'
import { apiUrl } from '@/lib/api'

interface EstimatePart {
  part_id: string
  part_name_en: string
  part_name_ar: string
  damage_type: string
  severity_label: 'Repair' | 'Replace'
  ai_original_severity: 'Repair' | 'Replace' | null
  price: number
  is_ai_detected: boolean
}

interface Labor {
  id: string
  labor_name_ar: string
  price: number
}

interface Claim {
  estimate_id: string
  workshop_id: string
  vehicle_year: number
  vehicle_make: string
  vehicle_model: string
  confirmed_at: string
  insurance_company_id: string
  labors: Labor[]
  estimate_parts: EstimatePart[]
}

type Tab = 'claims' | 'assessments'

function FlagBadge({ type }: { type: 'added' | 'changed' }) {
  const styles: Record<string, React.CSSProperties> = {
    added: { background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: '999px', padding: '2px 10px', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' },
    changed: { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '999px', padding: '2px 10px', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' },
  }
  return (
    <span style={styles[type]}>
      {type === 'added' ? '+ مضاف' : '⚠ تغيير'}
    </span>
  )
}

function getFlaggedParts(parts: EstimatePart[]) {
  return parts.filter(p =>
    p.is_ai_detected === false ||
    (p.ai_original_severity && p.ai_original_severity !== p.severity_label)
  )
}

function getTotalCost(parts: EstimatePart[]) {
  return parts.reduce((sum, p) => sum + (p.price || 0), 0)
}

export default function InsuranceDashboard() {
  const navigate = useNavigate()
  const session = getInsuranceSession()
  const [tab, setTab] = useState<Tab>('claims')
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null)

  useEffect(() => {
    if (!session) { navigate('/insurance/login'); return }
    loadClaims()
  }, [])

  const loadClaims = async () => {
    try {
      setLoading(true)
      const res = await fetch(
        apiUrl(`/api/insurance/claims?company_id=${session!.company_id}`)
      )
      if (!res.ok) throw new Error('فشل تحميل المطالبات')
      const data = await res.json()
      setClaims(data.claims || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const logout = () => { clearInsuranceSession(); navigate('/insurance/login') }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.625rem 1.5rem',
    border: 'none',
    borderBottom: active ? '2px solid #1e40af' : '2px solid transparent',
    background: 'transparent',
    color: active ? '#1e40af' : '#6b7280',
    fontWeight: active ? 700 : 500,
    fontSize: '0.9rem',
    cursor: 'pointer',
    transition: 'all .15s',
  })

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', direction: 'rtl' }}>

      {/* Header */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🏦</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#111827' }}>{session?.nameAr}</div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{session?.company_id.toUpperCase()} · بوابة التأمين</div>
            </div>
          </div>
          <button onClick={logout} style={{ padding: '0.5rem 1rem', border: '1.5px solid #e5e7eb', borderRadius: '0.5rem', background: 'white', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>
            تسجيل الخروج
          </button>
        </div>

        {/* Tabs */}
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', gap: '0.5rem' }}>
          <button style={tabStyle(tab === 'claims')} onClick={() => setTab('claims')}>مطالبات الحوادث</button>
          <button style={tabStyle(tab === 'assessments')} onClick={() => setTab('assessments')}>تقييم الأضرار</button>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>

        {/* ── MOTOR CLAIMS TAB ── */}
        {tab === 'claims' && (
          <>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'إجمالي المطالبات', value: claims.length, color: '#1e40af', bg: '#eff6ff' },
                { label: 'مطالبات بتغييرات', value: claims.filter(c => getFlaggedParts(c.estimate_parts).length > 0).length, color: '#c2410c', bg: '#fff7ed' },
                { label: 'في انتظار المراجعة', value: claims.length, color: '#059669', bg: '#ecfdf5' },
              ].map((s, i) => (
                <div key={i} style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.25rem 1.5rem', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.25rem' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Claims table */}
            <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb', fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
                التقارير المؤكدة من الورشات
              </div>

              {loading && (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>جاري التحميل...</div>
              )}
              {error && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>{error}</div>
              )}
              {!loading && !error && claims.length === 0 && (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                  لا توجد تقارير مؤكدة بعد
                </div>
              )}

              {!loading && claims.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb', fontSize: '0.8rem', color: '#6b7280' }}>
                      {['التاريخ', 'المركبة', 'الورشة', 'عدد القطع', 'التكلفة الإجمالية', 'التغييرات', ''].map((h, i) => (
                        <th key={i} style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((claim) => {
                      const flagged = getFlaggedParts(claim.estimate_parts)
                      const total = getTotalCost(claim.estimate_parts)
                      return (
                        <tr key={claim.estimate_id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                          <td style={{ padding: '0.875rem 1rem', fontSize: '0.85rem', color: '#374151' }}>
                            {new Date(claim.confirmed_at).toLocaleDateString('ar-EG')}
                          </td>
                          <td style={{ padding: '0.875rem 1rem', fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>
                            {claim.vehicle_make} {claim.vehicle_model} {claim.vehicle_year}
                          </td>
                          <td style={{ padding: '0.875rem 1rem', fontSize: '0.85rem', color: '#6b7280' }}>{claim.workshop_id}</td>
                          <td style={{ padding: '0.875rem 1rem', fontSize: '0.85rem', color: '#374151' }}>{claim.estimate_parts.length}</td>
                          <td style={{ padding: '0.875rem 1rem', fontWeight: 700, color: '#111827', fontSize: '0.9rem' }}>
                            {total.toLocaleString('ar-EG')} ج.م
                          </td>
                          <td style={{ padding: '0.875rem 1rem' }}>
                            {flagged.length > 0
                              ? <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '999px', padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700 }}>⚠ {flagged.length} تغيير</span>
                              : <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>✓ لا تغييرات</span>
                            }
                          </td>
                          <td style={{ padding: '0.875rem 1rem' }}>
                            <button
                              onClick={() => setSelectedClaim(claim)}
                              style={{ padding: '0.375rem 0.875rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                              عرض
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── DAMAGE ASSESSMENTS TAB ── */}
        {tab === 'assessments' && (
          <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
            <h2 style={{ fontWeight: 700, color: '#111827', marginBottom: '0.75rem' }}>تقييم أضرار جديد</h2>
            <p style={{ color: '#6b7280', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem' }}>
              ابدأ تقييماً من طرف شركة التأمين باستخدام نفس محرك التحليل المستخدم في الورشات.
            </p>
            <button
              onClick={() => navigate('/insurance/assessment')}
              style={{ padding: '0.875rem 2rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
              ابدأ تقييماً جديداً
            </button>
          </div>
        )}
      </div>

      {/* Claim Detail Modal */}
      {selectedClaim && (() => {
        const replaceParts = selectedClaim.estimate_parts.filter(p => p.severity_label === 'Replace')
        const repairParts  = selectedClaim.estimate_parts.filter(p => p.severity_label === 'Repair')
        const activeLabors = (selectedClaim.labors || []).filter(l => l.price > 0)
        const replaceTotal = replaceParts.reduce((s, p) => s + p.price, 0)
        const repairTotal  = repairParts.reduce((s, p) => s + p.price, 0)
        const laborTotal   = activeLabors.reduce((s, l) => s + l.price, 0)
        const grandTotal   = replaceTotal + repairTotal + laborTotal
        const flagCount    = getFlaggedParts(selectedClaim.estimate_parts).length

        const thStyle: React.CSSProperties = { padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 600, fontSize: '0.78rem', color: '#6b7280', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }
        const tdStyle: React.CSSProperties = { padding: '0.7rem 1rem', fontSize: '0.875rem' }

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            onClick={() => setSelectedClaim(null)}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: 'white', borderRadius: '1rem', width: '100%', maxWidth: '760px', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>

              {/* Header */}
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#111827' }}>
                    {selectedClaim.vehicle_make} {selectedClaim.vehicle_model} {selectedClaim.vehicle_year}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '3px', display: 'flex', gap: '1rem' }}>
                    <span>{selectedClaim.workshop_id}</span>
                    <span>{new Date(selectedClaim.confirmed_at).toLocaleDateString('ar-EG')}</span>
                    {flagCount > 0 && <span style={{ color: '#92400e', fontWeight: 600 }}>⚠ {flagCount} تغييرات</span>}
                  </div>
                </div>
                <button onClick={() => setSelectedClaim(null)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>

              {/* Flag legend */}
              <div style={{ padding: '0.6rem 1.5rem', background: '#fffbeb', borderBottom: '1px solid #fde68a', display: 'flex', gap: '1.5rem', fontSize: '0.75rem' }}>
                <span><span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: '999px', padding: '1px 8px', fontWeight: 700 }}>+ مضاف</span> أضافته الورشة يدوياً</span>
                <span><span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '999px', padding: '1px 8px', fontWeight: 700 }}>⚠ تغيير</span> تبدّل الإجراء</span>
              </div>

              <div style={{ overflowY: 'auto', flex: 1 }}>

                {/* ── SECTION 1: Replace parts ── */}
                <div style={{ padding: '1rem 1.5rem 0.5rem', background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🔴</span> قطع الاستبدال
                    <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.78rem' }}>({replaceParts.length} قطعة)</span>
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>القطعة</th>
                      <th style={thStyle}>نوع الضرر</th>
                      <th style={thStyle}>الإجراء</th>
                      <th style={thStyle}>التغييرات</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>السعر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {replaceParts.length === 0 && (
                      <tr><td colSpan={6} style={{ ...tdStyle, color: '#9ca3af', textAlign: 'center', padding: '1rem' }}>لا توجد قطع استبدال</td></tr>
                    )}
                    {replaceParts.map((part, i) => {
                      const isAdded   = part.is_ai_detected === false
                      const isChanged = !isAdded && part.ai_original_severity && part.ai_original_severity !== part.severity_label
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: (isAdded || isChanged) ? '#fffbeb' : 'white' }}>
                          <td style={{ ...tdStyle, color: '#9ca3af', width: '36px' }}>{i + 1}</td>
                          <td style={{ ...tdStyle, fontWeight: 600, color: '#111827' }}>{part.part_name_ar}</td>
                          <td style={{ ...tdStyle, color: '#6b7280' }}>{part.damage_type}</td>
                          <td style={tdStyle}>
                            <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: '999px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>استبدال</span>
                          </td>
                          <td style={tdStyle}>
                            {isAdded   && <FlagBadge type="added" />}
                            {isChanged && <FlagBadge type="changed" />}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'left' }}>{part.price.toLocaleString('ar-EG')} ج.م</td>
                        </tr>
                      )
                    })}
                    <tr style={{ background: '#fef2f2', borderTop: '1px solid #fecaca' }}>
                      <td colSpan={5} style={{ ...tdStyle, fontWeight: 700, color: '#dc2626', fontSize: '0.82rem' }}>إجمالي الاستبدال</td>
                      <td style={{ ...tdStyle, fontWeight: 800, color: '#dc2626', textAlign: 'left' }}>{replaceTotal.toLocaleString('ar-EG')} ج.م</td>
                    </tr>
                  </tbody>
                </table>

                {/* ── SECTION 2: Repair parts + Labors ── */}
                <div style={{ padding: '1rem 1.5rem 0.5rem', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', borderTop: '6px solid #f3f4f6' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🟢</span> أعمال الإصلاح والعمالة
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={{ ...thStyle, width: '55%' }}>البند</th>
                      <th style={thStyle}>النوع</th>
                      <th style={thStyle}>التغييرات</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>السعر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Repair parts */}
                    {repairParts.map((part, i) => {
                      const isAdded   = part.is_ai_detected === false
                      const isChanged = !isAdded && part.ai_original_severity && part.ai_original_severity !== part.severity_label
                      return (
                        <tr key={`r-${i}`} style={{ borderBottom: '1px solid #f3f4f6', background: (isAdded || isChanged) ? '#fffbeb' : 'white' }}>
                          <td style={{ ...tdStyle, color: '#9ca3af', width: '36px' }}>{i + 1}</td>
                          <td style={{ ...tdStyle, fontWeight: 600, color: '#111827' }}>{part.part_name_ar}</td>
                          <td style={tdStyle}>
                            <span style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: '999px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>إصلاح</span>
                          </td>
                          <td style={tdStyle}>
                            {isAdded   && <FlagBadge type="added" />}
                            {isChanged && <FlagBadge type="changed" />}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'left' }}>{part.price.toLocaleString('ar-EG')} ج.م</td>
                        </tr>
                      )
                    })}
                    {/* Labors */}
                    {activeLabors.map((labor, i) => (
                      <tr key={`l-${i}`} style={{ borderBottom: '1px solid #f3f4f6', background: '#f8fafc' }}>
                        <td style={{ ...tdStyle, color: '#9ca3af' }}>{repairParts.length + i + 1}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, color: '#374151' }}>{labor.labor_name_ar}</td>
                        <td style={tdStyle}>
                          <span style={{ background: '#eff6ff', color: '#1e40af', borderRadius: '999px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>عمالة</span>
                        </td>
                        <td style={tdStyle}></td>
                        <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'left' }}>{labor.price.toLocaleString('ar-EG')} ج.م</td>
                      </tr>
                    ))}
                    {repairParts.length === 0 && activeLabors.length === 0 && (
                      <tr><td colSpan={5} style={{ ...tdStyle, color: '#9ca3af', textAlign: 'center', padding: '1rem' }}>لا توجد أعمال إصلاح أو عمالة</td></tr>
                    )}
                    <tr style={{ background: '#f0fdf4', borderTop: '1px solid #bbf7d0' }}>
                      <td colSpan={4} style={{ ...tdStyle, fontWeight: 700, color: '#16a34a', fontSize: '0.82rem' }}>إجمالي الإصلاح والعمالة</td>
                      <td style={{ ...tdStyle, fontWeight: 800, color: '#16a34a', textAlign: 'left' }}>{(repairTotal + laborTotal).toLocaleString('ar-EG')} ج.م</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Footer total */}
              <div style={{ padding: '1rem 1.5rem', borderTop: '2px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb' }}>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#111827' }}>
                  الإجمالي الكلي: {grandTotal.toLocaleString('ar-EG')} ج.م
                </div>
                {flagCount > 0 && (
                  <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '999px', padding: '4px 14px', fontSize: '0.82rem', fontWeight: 700 }}>
                    ⚠ {flagCount} تغييرات تحتاج مراجعة
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

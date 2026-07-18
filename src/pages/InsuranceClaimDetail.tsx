import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getInsuranceSession, clearInsuranceSession } from '@/mock/insurance'
import { apiUrl } from '@/lib/api'

interface EstimatePart {
  part_id: string
  part_name_ar: string
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

export default function InsuranceClaimDetail() {
  const navigate = useNavigate()
  const { estimateId } = useParams()
  const session = getInsuranceSession()
  const [claim, setClaim] = useState<Claim | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) { navigate('/insurance/login'); return }
    if (!estimateId) { navigate('/insurance/dashboard'); return }
    loadClaim()
  }, [estimateId])

  const loadClaim = async () => {
    try {
      setLoading(true)
      const res = await fetch(
        apiUrl(`/api/insurance/claims?company_id=${session!.company_id}`)
      )
      if (!res.ok) throw new Error('فشل تحميل المطالبة')
      const data = await res.json()
      const c = data.claims.find((cl: any) => cl.estimate_id === estimateId)
      if (!c) throw new Error('لم تجد المطالبة')
      setClaim(c)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>جاري التحميل...</div>
  if (error) return <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>{error}</div>
  if (!claim) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>لم تجد المطالبة</div>

  const replaceParts = claim.estimate_parts.filter(p => p.severity_label === 'Replace')
  const repairParts  = claim.estimate_parts.filter(p => p.severity_label === 'Repair')
  const activeLabors = (claim.labors || []).filter(l => l.price > 0)
  const replaceTotal = replaceParts.reduce((s, p) => s + p.price, 0)
  const repairTotal  = repairParts.reduce((s, p) => s + p.price, 0)
  const laborTotal   = activeLabors.reduce((s, l) => s + l.price, 0)
  const grandTotal   = replaceTotal + repairTotal + laborTotal

  const thStyle: React.CSSProperties = { padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 600, fontSize: '0.78rem', color: '#6b7280', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }
  const tdStyle: React.CSSProperties = { padding: '0.7rem 1rem', fontSize: '0.875rem' }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '2rem 1rem', direction: 'rtl' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.5rem', borderBottom: '2px solid #e5e7eb' }}>
          <button onClick={() => navigate('/insurance/dashboard')} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.9rem', cursor: 'pointer', marginBottom: '1rem', fontWeight: 600 }}>
            ← العودة
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ margin: 0, color: '#111827', fontSize: '1.5rem', fontWeight: 800 }}>
                {claim.vehicle_make} {claim.vehicle_model} {claim.vehicle_year}
              </h1>
              <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.85rem' }}>
                {claim.workshop_id} · {new Date(claim.confirmed_at).toLocaleDateString('ar-EG')}
              </p>
            </div>
          </div>
        </div>

        {/* Flag legend */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', fontSize: '0.8rem' }}>
          <span><span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: '999px', padding: '1px 8px', fontWeight: 700 }}>+ مضاف</span> أضافته الورشة يدوياً</span>
          <span><span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '999px', padding: '1px 8px', fontWeight: 700 }}>⚠ تغيير</span> تبدّل الإجراء</span>
        </div>

        {/* SECTION 1: Replace */}
        <div style={{ background: 'white', borderRadius: '1rem', marginBottom: '1.5rem', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontWeight: 700, color: '#dc2626', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🔴</span> قطع الاستبدال <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.78rem' }}>({replaceParts.length})</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>القطعة</th>
                <th style={thStyle}>الإجراء</th>
                <th style={thStyle}>التغييرات</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>السعر</th>
              </tr>
            </thead>
            <tbody>
              {replaceParts.length === 0 && (
                <tr><td colSpan={5} style={{ ...tdStyle, color: '#9ca3af', textAlign: 'center', padding: '1rem' }}>لا توجد قطع استبدال</td></tr>
              )}
              {replaceParts.map((part, i) => {
                const isAdded   = part.is_ai_detected === false
                const isChanged = !isAdded && part.ai_original_severity && part.ai_original_severity !== part.severity_label
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: (isAdded || isChanged) ? '#fffbeb' : 'white' }}>
                    <td style={{ ...tdStyle, color: '#9ca3af', width: '36px' }}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#111827' }}>{part.part_name_ar}</td>
                    <td style={tdStyle}>
                      <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: '999px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>استبدال</span>
                    </td>
                    <td style={tdStyle}>
                      {isAdded && <FlagBadge type="added" />}
                      {isChanged && <FlagBadge type="changed" />}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'left' }}>{part.price.toLocaleString('ar-EG')} ج.م</td>
                  </tr>
                )
              })}
              <tr style={{ background: '#fef2f2', borderTop: '1px solid #fecaca' }}>
                <td colSpan={4} style={{ ...tdStyle, fontWeight: 700, color: '#dc2626', fontSize: '0.82rem' }}>إجمالي الاستبدال</td>
                <td style={{ ...tdStyle, fontWeight: 800, color: '#dc2626', textAlign: 'left' }}>{replaceTotal.toLocaleString('ar-EG')} ج.م</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* SECTION 2: Repair + Labors */}
        <div style={{ background: 'white', borderRadius: '1rem', marginBottom: '2rem', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', fontWeight: 700, color: '#16a34a', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🟢</span> أعمال الإصلاح والعمالة
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={{ ...thStyle, width: '55%' }}>البند</th>
                <th style={thStyle}>التغييرات</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>السعر</th>
              </tr>
            </thead>
            <tbody>
              {repairParts.map((part, i) => {
                const isAdded   = part.is_ai_detected === false
                const isChanged = !isAdded && part.ai_original_severity && part.ai_original_severity !== part.severity_label
                return (
                  <tr key={`r-${i}`} style={{ borderBottom: '1px solid #f3f4f6', background: (isAdded || isChanged) ? '#fffbeb' : 'white' }}>
                    <td style={{ ...tdStyle, color: '#9ca3af', width: '36px' }}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#111827' }}>{part.part_name_ar}</td>
                    <td style={tdStyle}>
                      {isAdded && <FlagBadge type="added" />}
                      {isChanged && <FlagBadge type="changed" />}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'left' }}>{part.price.toLocaleString('ar-EG')} ج.م</td>
                  </tr>
                )
              })}
              {activeLabors.map((labor, i) => (
                <tr key={`l-${i}`} style={{ borderBottom: '1px solid #f3f4f6', background: '#f8fafc' }}>
                  <td style={{ ...tdStyle, color: '#9ca3af' }}>{repairParts.length + i + 1}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#374151' }}>{labor.labor_name_ar}</td>
                  <td style={tdStyle}></td>
                  <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'left' }}>{labor.price.toLocaleString('ar-EG')} ج.م</td>
                </tr>
              ))}
              {repairParts.length === 0 && activeLabors.length === 0 && (
                <tr><td colSpan={4} style={{ ...tdStyle, color: '#9ca3af', textAlign: 'center', padding: '1rem' }}>لا توجد أعمال إصلاح أو عمالة</td></tr>
              )}
              <tr style={{ background: '#f0fdf4', borderTop: '1px solid #bbf7d0' }}>
                <td colSpan={3} style={{ ...tdStyle, fontWeight: 700, color: '#16a34a', fontSize: '0.82rem' }}>إجمالي الإصلاح والعمالة</td>
                <td style={{ ...tdStyle, fontWeight: 800, color: '#16a34a', textAlign: 'left' }}>{(repairTotal + laborTotal).toLocaleString('ar-EG')} ج.م</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Grand Total */}
        <div style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '3px solid #2563eb' }}>
          <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#111827' }}>
            الإجمالي الكلي: {grandTotal.toLocaleString('ar-EG')} ج.م
          </div>
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            onClick={() => { alert('تمت الموافقة'); navigate('/insurance/dashboard'); }}
            style={{ padding: '1rem 3rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', transition: 'background .2s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#059669')}
            onMouseLeave={e => (e.currentTarget.style.background = '#10b981')}
          >
            ✓ موافق
          </button>
          <button
            onClick={() => { alert('تم الرفض'); navigate('/insurance/dashboard'); }}
            style={{ padding: '1rem 3rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', transition: 'background .2s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#dc2626')}
            onMouseLeave={e => (e.currentTarget.style.background = '#ef4444')}
          >
            ✗ رفض
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getInsuranceSession, clearInsuranceSession } from '@/mock/insurance'
import { apiUrl } from '@/lib/api'

interface PhotosModalProps {
  estimateId: string
  vehicleLabel: string
  onClose: () => void
}

function PhotosModal({ estimateId, vehicleLabel, onClose }: PhotosModalProps) {
  const [images, setImages] = useState<{ id: string; cloudinary_url: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch(apiUrl(`/api/images?estimate_id=${estimateId}`))
      .then(r => r.json())
      .then(d => setImages(d.images || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [estimateId])

  const handleDownload = async (url: string, index: number) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `estimate-photo-${index + 1}.jpg`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      window.open(url, '_blank')
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100 }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        backgroundColor: 'white', borderRadius: '1rem', width: '90%', maxWidth: '560px',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        zIndex: 101, direction: 'rtl', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <div style={{ fontWeight: '700', fontSize: '1rem', color: '#111827' }}>📷 صور التقدير</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.15rem' }}>{vehicleLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#6b7280', padding: '0.25rem' }}>✕</button>
        </div>

        {/* Images grid */}
        <div style={{ overflowY: 'auto', padding: '1rem', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>جاري التحميل...</div>
          ) : images.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>لا توجد صور بعد</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img
                    src={img.cloudinary_url}
                    alt=""
                    onClick={() => setLightboxUrl(img.cloudinary_url)}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', display: 'block' }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDownload(img.cloudinary_url, i) }}
                    title="تحميل"
                    style={{ position: 'absolute', bottom: '5px', left: '5px', backgroundColor: 'rgba(0,0,0,0.55)', color: 'white', border: 'none', borderRadius: '5px', padding: '3px 6px', fontSize: '0.75rem', cursor: 'pointer', lineHeight: 1 }}
                  >⬇</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {images.length > 0 && (
          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => images.forEach((img, i) => handleDownload(img.cloudinary_url, i))}
              style={{ padding: '0.65rem 1.75rem', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '0.6rem', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >⬇ تحميل الكل</button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightboxUrl} alt="" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: '8px', objectFit: 'contain' }} />
        </div>
      )}
    </>
  )
}

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

function getTotalCost(parts: EstimatePart[], labors: Labor[] = []) {
  const partsCost = parts.reduce((sum, p) => sum + (p.price || 0), 0)
  const laborsCost = labors.reduce((sum, l) => sum + (l.price || 0), 0)
  return partsCost + laborsCost
}

export default function InsuranceDashboard() {
  const navigate = useNavigate()
  const session = getInsuranceSession()
  const [tab, setTab] = useState<Tab>('claims')
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [photosModal, setPhotosModal] = useState<{ estimateId: string; vehicleLabel: string } | null>(null)

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
                      {['التاريخ', 'المركبة', 'الورشة', 'عدد القطع', 'التكلفة الإجمالية', 'التغييرات', 'صور', ''].map((h, i) => (
                        <th key={i} style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((claim) => {
                      const flagged = getFlaggedParts(claim.estimate_parts)
                      const total = getTotalCost(claim.estimate_parts, claim.labors)
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
                              onClick={() => setPhotosModal({ estimateId: claim.estimate_id, vehicleLabel: `${claim.vehicle_make} ${claim.vehicle_model} ${claim.vehicle_year}` })}
                              style={{ padding: '0.375rem 0.875rem', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                              📷 صور
                            </button>
                          </td>
                          <td style={{ padding: '0.875rem 1rem' }}>
                            <button
                              onClick={() => navigate(`/insurance/claim/${claim.estimate_id}`)}
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

      {photosModal && (
        <PhotosModal
          estimateId={photosModal.estimateId}
          vehicleLabel={photosModal.vehicleLabel}
          onClose={() => setPhotosModal(null)}
        />
      )}
    </div>
  )
}

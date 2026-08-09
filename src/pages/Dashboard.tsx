import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

type EstimateStatus = 'draft' | 'confirmed' | 'approved_by_insurance' | 'rejected_by_insurance' | 'counter_offer' | 'workshop_revised' | 'workshop_accepted' | 'settled'

interface ExtraImage { id: string; cloudinary_url: string }

interface Estimate {
  estimate_id: string
  vehicle_year: number
  vehicle_make: string
  vehicle_model: string
  vin_number?: string | null
  status: EstimateStatus
  insurance_company_id?: string | null
  insurance_action?: string | null
  insurance_comment?: string | null
  parent_estimate_id?: string | null
  total_cost_min?: number
  total_cost_max?: number
  created_at: string
  confirmed_at?: string
  settled_at?: string
  parts: any[]
  extra_images_by_workshop?: ExtraImage[]
}

const STATUS_CONFIG: Record<EstimateStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:                  { label: 'مسودة',                   color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  confirmed:              { label: 'أُرسل للتأمين',           color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  approved_by_insurance:  { label: 'موافقة التأمين',          color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  rejected_by_insurance:  { label: 'رفض التأمين',             color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  counter_offer:          { label: 'تفاوض — بانتظار ردك',    color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  workshop_revised:       { label: 'تم الرد — بانتظار التأمين',    color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  workshop_accepted:      { label: 'وافقت على العرض — بانتظار التأمين', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  settled:                { label: 'تمت التسوية',              color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
}

// Insurance action badges shown on estimate card
function InsuranceBadge({ status, insuranceAction, insuranceCompanyId, estimateId, navigate }: {
  status: EstimateStatus
  insuranceAction?: string | null
  insuranceCompanyId?: string | null
  estimateId: string
  navigate: (path: string) => void
}) {
  // No insurance company linked — show nothing
  if (!insuranceCompanyId) return <span style={{ color: '#d1d5db', fontSize: '0.8rem' }}>—</span>

  if (status === 'approved_by_insurance') return (
    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', background: '#f0fdf4', border: '1.5px solid #16a34a', color: '#16a34a', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
      ✅ موافقه من التامين
    </span>
  )
  if (status === 'rejected_by_insurance') return (
    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', background: '#fef2f2', border: '1.5px solid #dc2626', color: '#dc2626', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
      ❌ مرفوض
    </span>
  )
  if (status === 'confirmed' && insuranceAction === 'without_commitment') return (
    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', background: '#f9fafb', border: '1.5px solid #9ca3af', color: '#6b7280', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
      بدون التزام
    </span>
  )
  if (status === 'counter_offer') return (
    <button
      onClick={() => navigate(`/estimate/${estimateId}/negotiate`)}
      style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', background: '#fffbeb', border: '1.5px solid #d97706', color: '#d97706', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      🔄 تفاوض — اضغط للمراجعة
    </button>
  )
  if (status === 'workshop_revised') return (
    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', background: '#f5f3ff', border: '1.5px solid #7c3aed', color: '#7c3aed', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
      🕐 تم الرد — بانتظار التأمين
    </span>
  )
  if (status === 'workshop_accepted') return (
    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', background: '#ecfeff', border: '1.5px solid #0891b2', color: '#0891b2', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
      ✔ وافقت على العرض — بانتظار التأمين
    </span>
  )
  // confirmed + insurance company set + no action yet = waiting
  return (
    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', background: '#eff6ff', border: '1.5px solid #93c5fd', color: '#1d4ed8', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
      ⏳ بانتظار التأمين
    </span>
  )
}

interface ImageRecord {
  id: string
  cloudinary_url: string
  cloudinary_public_id: string
}

interface PhotosModalProps {
  estimate: Estimate
  images: ImageRecord[]
  onClose: () => void
}

function PhotosModal({ estimate, images, onClose }: PhotosModalProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const localImages = images

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
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 100,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'white',
        borderRadius: '1rem',
        width: '90%', maxWidth: '560px',
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        zIndex: 101,
        direction: 'rtl',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #e5e7eb',
        }}>
          <div>
            <div style={{ fontWeight: '700', fontSize: '1rem', color: '#111827' }}>
              📷 صور التقدير
            </div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.15rem' }}>
              {estimate.vehicle_make} {estimate.vehicle_model} • {estimate.vehicle_year}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '1.25rem', color: '#6b7280', lineHeight: 1,
              padding: '0.25rem',
            }}
          >✕</button>
        </div>

        {/* Images grid */}
        <div style={{ overflowY: 'auto', padding: '1rem', flex: 1 }}>
          {localImages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: '#9ca3af' }}>
              لا توجد صور بعد
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.5rem',
            }}>
              {localImages.map((img, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img
                    src={img.cloudinary_url}
                    alt=""
                    onClick={() => setLightboxUrl(img.cloudinary_url)}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      cursor: 'pointer',
                      display: 'block',
                    }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDownload(img.cloudinary_url, i) }}
                    title="تحميل"
                    style={{
                      position: 'absolute',
                      bottom: '5px',
                      left: '5px',
                      backgroundColor: 'rgba(0,0,0,0.55)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      padding: '3px 6px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      lineHeight: 1,
                    }}
                  >⬇</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer upload button */}
        {localImages.length > 0 && (
          <div style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex', justifyContent: 'center',
          }}>
            <button
              onClick={() => localImages.forEach((img, i) => handleDownload(img.cloudinary_url, i))}
              style={{
                padding: '0.65rem 1.75rem',
                backgroundColor: '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: '0.6rem',
                fontWeight: '700',
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}
            >
              ⬇ تحميل الكل
            </button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.92)',
            zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxUrl}
            alt=""
            style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: '8px', objectFit: 'contain' }}
          />
        </div>
      )}
    </>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workshop, setWorkshop] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [insuranceFilter, setInsuranceFilter] = useState<string>('all')
  const [estimateImages, setEstimateImages] = useState<Record<string, ImageRecord[]>>({})
  const [photosModal, setPhotosModal] = useState<Estimate | null>(null)
  const [extraImagesModal, setExtraImagesModal] = useState<{ images: ExtraImage[]; label: string } | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [mainTab, setMainTab] = useState<'estimates' | 'bookings'>('estimates')
  const [bookings, setBookings] = useState<any[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingPhotoModal, setBookingPhotoModal] = useState<string[] | null>(null)

  // Top-level confirmed estimates only (supplements are visible inside the Report chain)
  const topLevel = estimates.filter(e => !e.parent_estimate_id && e.status !== 'draft' && e.status !== 'exported' as any)

  const filtered = topLevel.filter((est) => {
    const q = searchQuery.toLowerCase()
    return (
      est.vehicle_make.toLowerCase().includes(q) ||
      est.vehicle_model.toLowerCase().includes(q) ||
      est.vehicle_year.toString().includes(q) ||
      (est.vin_number || '').toLowerCase().includes(q)
    )
  })

  const displayed = filtered.filter((est) => {
    if (insuranceFilter === 'all') return true
    let key: string
    if (!est.insurance_company_id) key = 'no_insurance'
    else if (est.status === 'approved_by_insurance') key = 'approved_by_insurance'
    else if (est.status === 'rejected_by_insurance') key = 'rejected_by_insurance'
    else if (est.status === 'confirmed' && est.insurance_action === 'without_commitment') key = 'without_commitment'
    else if (est.status === 'counter_offer') key = 'counter_offer'
    else if (est.status === 'workshop_revised') key = 'workshop_revised'
    else if (est.status === 'workshop_accepted') key = 'workshop_accepted'
    else key = 'waiting'
    return key === insuranceFilter
  })

  // Count supplements per parent
  const supplementCount: Record<string, number> = {}
  estimates.forEach(e => {
    if (e.parent_estimate_id) supplementCount[e.parent_estimate_id] = (supplementCount[e.parent_estimate_id] || 0) + 1
  })

  useEffect(() => {
    const workshopData = localStorage.getItem('workshop')
    if (workshopData) setWorkshop(JSON.parse(workshopData))
    loadEstimates()
  }, [navigate])

  const loadEstimates = async () => {
    const token = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }

    try {
      setLoading(true)
      const response = await fetch(apiUrl('/api/estimates'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('فشل تحميل التقديرات')

      const data = await response.json()
      const all: Estimate[] = data.estimates || []
      setEstimates(all)

      const withImages = all.filter(e => !e.parent_estimate_id && e.status !== 'draft')
      const imageResults = await Promise.all(
        withImages.map(async (est) => {
          try {
            const imgRes = await fetch(apiUrl(`/api/images?estimate_id=${est.estimate_id}`))
            if (!imgRes.ok) return { id: est.estimate_id, records: [] }
            const imgData = await imgRes.json()
            return { id: est.estimate_id, records: imgData.images || [] }
          } catch {
            return { id: est.estimate_id, records: [] }
          }
        })
      )
      const imagesMap: Record<string, ImageRecord[]> = {}
      imageResults.forEach(({ id, records }) => { imagesMap[id] = records })
      setEstimateImages(imagesMap)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل التقديرات')
    } finally {
      setLoading(false)
    }
  }

  const loadBookings = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    setBookingsLoading(true)
    try {
      const res = await fetch(apiUrl('/api/estimates/consumer-bookings'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) setBookings(data.bookings || [])
    } catch { /* silent */ }
    finally { setBookingsLoading(false) }
  }

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ar-EG')
  const formatDateTime = (dateStr: string) => new Date(dateStr).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
  const handleLogout = () => { localStorage.clear(); navigate('/login') }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', direction: 'rtl' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#6b7280', borderBottom: '1px solid #4b5563', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {workshop?.is_super_admin && (
              <button onClick={() => navigate('/admin')} style={{ padding: '0.5rem 1.25rem', backgroundColor: '#7c3aed', color: 'white', borderRadius: '0.5rem', fontWeight: '500', border: 'none', cursor: 'pointer' }}>
                ⚙️ Admin
              </button>
            )}
            <button onClick={() => navigate('/pricing')} style={{ padding: '0.45rem 0.75rem', backgroundColor: '#2563eb', color: 'white', borderRadius: '0.5rem', fontWeight: '500', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
              💷 الأسعار
            </button>
            <button onClick={handleLogout} style={{ padding: '0.45rem 0.75rem', backgroundColor: '#dc2626', color: 'white', borderRadius: '0.5rem', fontWeight: '500', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
              🚪 خروج
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#60a5fa', margin: 0, lineHeight: 1.1 }}>G-Fast</h1>
            {workshop && (
              <span style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '45vw', textAlign: 'right' }}>
                {workshop.workshop_name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0.75rem 0.5rem' }}>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/analysis')}
            style={{ padding: '0.75rem 1.5rem', backgroundColor: '#2563eb', color: 'white', borderRadius: '0.5rem', fontWeight: 'bold', fontSize: '1.125rem', border: 'none', cursor: 'pointer' }}
          >➕ تقدير جديد</button>
          <button
            onClick={() => { setMainTab(mainTab === 'bookings' ? 'estimates' : 'bookings'); if (mainTab !== 'bookings' && bookings.length === 0) loadBookings() }}
            style={{ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', background: mainTab === 'bookings' ? '#111827' : 'white', color: mainTab === 'bookings' ? 'white' : '#374151', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >📥 حجوزات العملاء</button>
        </div>

        {/* ── BOOKINGS TAB ── */}
        {mainTab === 'bookings' && (
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', boxShadow: '0 4px 12px rgba(0,0,0,0.07)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', margin: 0, color: '#111827' }}>📥 حجوزات العملاء</h2>
              <button onClick={loadBookings} style={{ padding: '0.4rem 0.9rem', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>🔄 تحديث</button>
            </div>
            {bookingsLoading ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#6b7280' }}>⏳ جارٍ التحميل...</div>
            ) : bookings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#6b7280' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                لا توجد حجوزات بعد
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {bookings.map((b: any) => (
                  <div key={b.id} style={{ border: '1.5px solid #e5e7eb', borderRadius: '0.75rem', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#111827', direction: 'ltr' }}>{b.customer_mobile}</span>
                        {b.vehicle_make && (
                          <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                            {[b.vehicle_make, b.vehicle_model, b.vehicle_year].filter(Boolean).join(' ')}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{formatDateTime(b.created_at)}</span>
                    </div>

                    {/* Report link */}
                    {b.report_url && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.82rem', color: '#6b7280', fontWeight: 600 }}>رابط التقرير:</span>
                        <a href={b.report_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.82rem', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>📄 عرض التقرير</a>
                        <button
                          onClick={() => { navigator.clipboard.writeText(b.report_url); }}
                          style={{ padding: '0.2rem 0.6rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.35rem', cursor: 'pointer', fontSize: '0.75rem', color: '#1d4ed8', fontWeight: 600 }}
                        >نسخ الرابط</button>
                      </div>
                    )}

                    {/* Photos */}
                    {b.image_urls && b.image_urls.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.82rem', color: '#6b7280', fontWeight: 600, marginBottom: '0.4rem' }}>صور التحليل ({b.image_urls.length})</div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {b.image_urls.slice(0, 6).map((url: string, i: number) => (
                            <img
                              key={i}
                              src={url}
                              alt=""
                              onClick={() => setBookingPhotoModal(b.image_urls)}
                              style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '0.4rem', border: '1px solid #e5e7eb', cursor: 'pointer' }}
                            />
                          ))}
                          {b.image_urls.length > 6 && (
                            <button onClick={() => setBookingPhotoModal(b.image_urls)} style={{ width: 56, height: 56, borderRadius: '0.4rem', border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: '0.75rem', color: '#6b7280', fontWeight: 700 }}>+{b.image_urls.length - 6}</button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Mobile CTA */}
                    <div>
                      <a href={`tel:${b.customer_mobile}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', background: '#16a34a', color: 'white', borderRadius: '0.4rem', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700 }}>
                        📞 اتصل بالعميل
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {mainTab === 'estimates' && (
        <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '0.75rem 0.5rem' }}>

          {topLevel.length > 0 && (
            <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالماركة أو الموديل أو السنة أو VIN..."
                style={{ flex: 1, minWidth: '160px', padding: '0.6rem 0.75rem', border: '2px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem', textAlign: 'right', outline: 'none' }}
                onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
              />
              {workshop?.workshop_id === 'workshop-001' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600 }}>رد التامين:</span>
                  <select
                    value={insuranceFilter}
                    onChange={e => setInsuranceFilter(e.target.value)}
                    style={{ padding: '0.65rem 0.75rem', border: '2px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.85rem', color: '#374151', background: 'white', cursor: 'pointer', fontWeight: 600, outline: 'none' }}
                    onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  >
                    <option value="all">الكل</option>
                    <option value="waiting">⏳ بانتظار التأمين</option>
                    <option value="approved_by_insurance">✅ موافقه من التامين</option>
                    <option value="rejected_by_insurance">❌ مرفوض</option>
                    <option value="without_commitment">بدون التزام</option>
                    <option value="counter_offer">🔄 تفاوض</option>
                    <option value="workshop_revised">🕐 تم الرد — بانتظار التأمين</option>
                    <option value="workshop_accepted">✔ وافقت على العرض</option>
                    <option value="no_insurance">— بدون تأمين</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {error && <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#fee2e2', borderRight: '4px solid #ef4444', borderRadius: '0.5rem', color: '#991b1b', fontWeight: '500' }}>⚠️ {error}</div>}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}><p style={{ color: '#6b7280' }}>⏳ جاري التحميل...</p></div>
          ) : topLevel.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '1.125rem' }}>لا توجد تقديرات بعد</p>
              <button onClick={() => navigate('/analysis')} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#2563eb', color: 'white', borderRadius: '0.5rem', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                ➕ إنشاء تقدير جديد
              </button>
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: '#6b7280' }}>
                {searchQuery ? `لم يتم العثور على نتائج لـ "${searchQuery}"` : 'لا توجد نتائج لهذا الفلتر'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {displayed.map((estimate) => {
                const imgs = estimateImages[estimate.estimate_id] || []
                const cfg  = STATUS_CONFIG[estimate.status] || STATUS_CONFIG.confirmed
                const firstImg = imgs[0]
                const sups = estimates.filter(s => s.parent_estimate_id === estimate.estimate_id)
                const hasInsurance = !!estimate.insurance_company_id
                const canAddSup = hasInsurance ? estimate.status === 'approved_by_insurance' : estimate.status !== 'draft'
                const extraImgs = estimate.extra_images_by_workshop || []

                // For non-insurance workshops, "confirmed" just means confirmed — not "sent to insurance"
                const isInsuranceWorkshop = workshop?.workshop_id === 'workshop-001'
                const statusLabel = (!isInsuranceWorkshop && estimate.status === 'confirmed') ? 'مؤكد' : cfg.label
                const statusColor = (!isInsuranceWorkshop && estimate.status === 'confirmed') ? '#16a34a' : cfg.color
                const statusBg    = (!isInsuranceWorkshop && estimate.status === 'confirmed') ? '#f0fdf4' : cfg.bg
                const statusBorder = (!isInsuranceWorkshop && estimate.status === 'confirmed') ? '#bbf7d0' : cfg.border

                return (
                  <div key={estimate.estimate_id} style={{ border: `1.5px solid #e5e7eb`, borderRadius: '0.65rem', backgroundColor: 'white', overflow: 'hidden' }}>
                    {/* Card header — vehicle + date */}
                    <div style={{ padding: '0.65rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#111827', lineHeight: 1.3 }}>
                          {estimate.vehicle_make} {estimate.vehicle_model}
                          {' · '}
                          <span style={{ fontWeight: 600, color: '#6b7280', fontSize: '0.85rem' }}>{estimate.vehicle_year}</span>
                        </div>
                        {estimate.vin_number && (
                          <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontFamily: 'monospace', marginTop: '0.15rem' }}>VIN: {estimate.vin_number}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.7rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{formatDate(estimate.created_at)}</span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: statusColor, backgroundColor: statusBg, border: `1px solid ${statusBorder}`, borderRadius: '999px', padding: '0.1rem 0.5rem', whiteSpace: 'nowrap' }}>{statusLabel}</span>
                      </div>
                    </div>

                    {/* Insurance rejection reason — insurance workshop only */}
                    {isInsuranceWorkshop && estimate.status === 'rejected_by_insurance' && estimate.insurance_comment && (
                      <div style={{ padding: '0.4rem 0.75rem', backgroundColor: '#fef2f2', fontSize: '0.78rem' }}>
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>سبب الرفض: </span>
                        <span style={{ color: '#7f1d1d' }}>{estimate.insurance_comment}</span>
                      </div>
                    )}

                    {/* Action buttons — fixed order: photos · report (wide) · audit · supplement */}
                    <div style={{ padding: '0.55rem 0.6rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>

                      {/* Photos */}
                      <button onClick={() => setPhotosModal(estimate)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.45rem 0.75rem', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '0.45rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }}>
                        {firstImg ? <img src={firstImg.cloudinary_url} alt="" style={{ width: '20px', height: '20px', objectFit: 'cover', borderRadius: '3px' }} /> : '📷'}
                        {imgs.length > 0 && <span>{imgs.length}</span>}
                      </button>

                      {/* Report — flex:1 so it fills available width */}
                      <button onClick={() => navigate(`/report/${estimate.estimate_id}`)}
                        style={{ flex: 1, padding: '0.45rem 0.75rem', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '0.45rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center' }}>
                        📄 عرض التقرير
                      </button>

                      {/* Audit */}
                      <button onClick={() => navigate(`/estimate/${estimate.estimate_id}/audit`)}
                        style={{ padding: '0.45rem 0.75rem', background: '#fffbeb', border: '1.5px solid #d97706', color: '#d97706', borderRadius: '0.45rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        السجل
                      </button>

                      {/* Supplements — after audit */}
                      {(sups.length > 0 || canAddSup) && (
                        <button onClick={() => navigate(`/estimate/${estimate.estimate_id}/supplements`)}
                          style={{ padding: '0.45rem 0.75rem', background: sups.length > 0 ? '#f5f3ff' : '#faf5ff', border: `1.5px solid ${sups.length > 0 ? '#a78bfa' : '#ddd6fe'}`, borderRadius: '0.45rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', color: '#7c3aed', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {sups.length > 0 ? `📋 ${sups.length} ملحق` : '➕ ملحق'}
                        </button>
                      )}

                      {/* Insurance badge — workshop-001 only */}
                      {isInsuranceWorkshop && (
                        <InsuranceBadge
                          status={estimate.status}
                          insuranceAction={estimate.insurance_action}
                          insuranceCompanyId={estimate.insurance_company_id}
                          estimateId={estimate.estimate_id}
                          navigate={navigate}
                        />
                      )}

                      {/* Workshop extra images — workshop-001 only */}
                      {isInsuranceWorkshop && (
                        <button
                          onClick={() => setExtraImagesModal({ images: extraImgs, label: `${estimate.vehicle_make} ${estimate.vehicle_model} ${estimate.vehicle_year}` })}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.45rem 0.75rem', background: extraImgs.length > 0 ? '#f5f3ff' : '#f9fafb', border: `1.5px solid ${extraImgs.length > 0 ? '#7c3aed' : '#e5e7eb'}`, borderRadius: '0.45rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', color: extraImgs.length > 0 ? '#7c3aed' : '#9ca3af', whiteSpace: 'nowrap' }}>
                          🖼{extraImgs.length > 0 ? ` ${extraImgs.length}` : ''}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )} {/* end estimates tab */}
      </div>

      {/* Booking photos modal */}
      {bookingPhotoModal && (
        <div onClick={() => setBookingPhotoModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <button onClick={() => setBookingPhotoModal(null)} style={{ position: 'absolute', top: 16, left: 16, background: 'none', border: 'none', color: 'white', fontSize: '1.8rem', cursor: 'pointer' }}>✕</button>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', maxHeight: '90vh', overflowY: 'auto' }}>
            {bookingPhotoModal.map((url, i) => (
              <img key={i} src={url} alt="" onClick={e => e.stopPropagation()} style={{ maxHeight: 260, maxWidth: '45vw', objectFit: 'contain', borderRadius: '0.5rem', border: '2px solid rgba(255,255,255,0.2)' }} />
            ))}
          </div>
        </div>
      )}

      {photosModal && (
        <PhotosModal estimate={photosModal} images={estimateImages[photosModal.estimate_id] || []} onClose={() => setPhotosModal(null)} />
      )}

      {/* Extra images popup */}
      {extraImagesModal && (
        <>
          <div onClick={() => setExtraImagesModal(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: '1rem', width: '90%', maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', zIndex: 101, direction: 'rtl', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>🖼 صور إضافية من الورشة</div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.15rem' }}>{extraImagesModal.label}</div>
              </div>
              <button onClick={() => setExtraImagesModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '1rem', flex: 1 }}>
              {extraImagesModal.images.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>لا توجد صور إضافية</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem' }}>
                  {extraImagesModal.images.map((img, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <img
                        src={img.cloudinary_url} alt=""
                        onClick={() => setLightboxUrl(img.cloudinary_url)}
                        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', display: 'block' }}
                      />
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          try {
                            const res = await fetch(img.cloudinary_url)
                            const blob = await res.blob()
                            const a = document.createElement('a')
                            a.href = URL.createObjectURL(blob)
                            a.download = `workshop-image-${idx + 1}.jpg`
                            a.click()
                            URL.revokeObjectURL(a.href)
                          } catch { window.open(img.cloudinary_url, '_blank') }
                        }}
                        style={{ position: 'absolute', bottom: '5px', left: '5px', backgroundColor: 'rgba(0,0,0,0.55)', color: 'white', border: 'none', borderRadius: '5px', padding: '3px 6px', fontSize: '0.75rem', cursor: 'pointer' }}
                      >⬇</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightboxUrl} alt="" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: '8px', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}

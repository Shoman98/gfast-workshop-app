import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

type EstimateStatus = 'draft' | 'confirmed' | 'approved_by_insurance' | 'rejected_by_insurance' | 'counter_offer' | 'workshop_revised' | 'workshop_accepted' | 'settled'

interface Supplement {
  estimate_id: string
  vehicle_year: number
  vehicle_make: string
  vehicle_model: string
  status: EstimateStatus
  insurance_company_id?: string | null
  insurance_action?: string | null
  parent_estimate_id: string
  confirmed_at?: string
  created_at: string
  pricing_data?: { grand_total?: number }
  vin_number?: string
  customer_name?: string
  customer_mobile?: string
}

interface ParentEstimate {
  estimate_id: string
  vehicle_year: number
  vehicle_make: string
  vehicle_model: string
  status: EstimateStatus
  insurance_company_id?: string | null
  vin_number?: string
  customer_name?: string
  customer_mobile?: string
}

const STATUS_CONFIG: Record<EstimateStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:                  { label: 'مسودة',                            color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  confirmed:              { label: 'أُرسل للتأمين',                   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  approved_by_insurance:  { label: 'موافقة التأمين',                   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  rejected_by_insurance:  { label: 'رفض التأمين',                      color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  counter_offer:          { label: 'تفاوض — بانتظار ردك',             color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  workshop_revised:       { label: 'تم الرد — بانتظار التأمين',       color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  workshop_accepted:      { label: 'وافقت على العرض — بانتظار التأمين', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  settled:                { label: 'تمت التسوية',                       color: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
}

interface ImageRecord {
  id: string
  cloudinary_url: string
  cloudinary_public_id: string
}

function SupplementPhotosModal({ title, images, onClose }: { title: string; images: ImageRecord[]; onClose: () => void }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const handleDownload = async (url: string, index: number) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `supplement-photo-${index + 1}.jpg`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      window.open(url, '_blank')
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'white', borderRadius: '1rem', width: '90%', maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', zIndex: 101, direction: 'rtl', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>📷 صور الملحق</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.15rem' }}>{title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#6b7280', lineHeight: 1, padding: '0.25rem' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '1rem', flex: 1 }}>
          {images.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: '#9ca3af' }}>لا توجد صور</div>
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
        {images.length > 0 && (
          <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => images.forEach((img, i) => handleDownload(img.cloudinary_url, i))}
              style={{ padding: '0.65rem 1.75rem', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '0.6rem', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >⬇ تحميل الكل</button>
          </div>
        )}
      </div>
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightboxUrl} alt="" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: '8px', objectFit: 'contain' }} />
        </div>
      )}
    </>
  )
}

export default function SupplementaryPage() {
  const { estimateId } = useParams()
  const navigate = useNavigate()
  const [parent, setParent] = useState<ParentEstimate | null>(null)
  const [supplements, setSupplements] = useState<Supplement[]>([])
  const [imagesMap, setImagesMap] = useState<Record<string, ImageRecord[]>>({})
  const [photosModal, setPhotosModal] = useState<{ title: string; images: ImageRecord[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [estimateId])

  const load = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/api/estimates'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('فشل تحميل التقديرات')
      const data = await res.json()
      const all: any[] = data.estimates || []
      const p = all.find(e => e.estimate_id === estimateId)
      if (!p) throw new Error('لم يتم العثور على التقدير')
      setParent(p)
      const sups = all.filter(e => e.parent_estimate_id === estimateId)
      setSupplements(sups)
      // Fetch each supplement's own images (general + damage) uploaded during analysis
      const entries = await Promise.all(sups.map(async (s) => {
        try {
          const imgRes = await fetch(apiUrl(`/api/images?estimate_id=${s.estimate_id}`))
          if (!imgRes.ok) return [s.estimate_id, []] as const
          const imgData = await imgRes.json()
          return [s.estimate_id, (imgData.images || []) as ImageRecord[]] as const
        } catch {
          return [s.estimate_id, []] as const
        }
      }))
      setImagesMap(Object.fromEntries(entries))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const startNewSupplement = () => {
    if (!parent) return
    sessionStorage.setItem('supplementData', JSON.stringify({
      parentEstimateId: parent.estimate_id,
      vehicle: {
        year: parent.vehicle_year,
        make: parent.vehicle_make,
        model: parent.vehicle_model,
        insurance_company_id: parent.insurance_company_id || null,
        vin_number: parent.vin_number || null,
        customer_name: parent.customer_name || null,
        customer_mobile: parent.customer_mobile || null,
      },
    }))
    navigate('/analysis')
  }

  const canAddSupplement = parent
    ? parent.insurance_company_id
      ? parent.status === 'approved_by_insurance'
      : parent.status !== 'draft'
    : false

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>⏳ جاري التحميل...</div>
  if (error)   return <div style={{ padding: '3rem', textAlign: 'center', color: '#dc2626' }}>{error}</div>
  if (!parent) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '1.5rem 1rem', direction: 'rtl' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.25rem 1.5rem', marginBottom: '1.25rem', border: '1px solid #e5e7eb' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem', padding: 0 }}
          >← العودة للرئيسية</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.3rem', fontWeight: 800, color: '#111827' }}>
                ملاحق المقايسه
              </h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>
                {parent.vehicle_make} {parent.vehicle_model} {parent.vehicle_year}
                {parent.customer_name && <> · {parent.customer_name}</>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {canAddSupplement && (
                <button
                  onClick={startNewSupplement}
                  style={{ padding: '0.5rem 1.1rem', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}
                >➕ إضافة ملحق جديد</button>
              )}
            </div>
          </div>
        </div>

        {/* Supplements list */}
        {supplements.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '3rem', textAlign: 'center', border: '1px dashed #e5e7eb', color: '#9ca3af' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📋</div>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>لا توجد ملاحق بعد</div>
            {canAddSupplement && (
              <button onClick={startNewSupplement} style={{ marginTop: '0.75rem', padding: '0.6rem 1.25rem', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, cursor: 'pointer' }}>
                ➕ إنشاء أول ملحق
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {supplements.map((sup, idx) => {
              const cfg = STATUS_CONFIG[sup.status] || STATUS_CONFIG.confirmed
              const total = sup.pricing_data?.grand_total
              return (
                <div key={sup.estimate_id} style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  {/* Card header */}
                  <div style={{ padding: '0.85rem 1.25rem', background: '#f5f3ff', borderBottom: '2px solid #ddd6fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, color: '#7c3aed', fontSize: '0.95rem' }}>ملحق {idx + 1}</span>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                      {sup.confirmed_at
                        ? new Date(sup.confirmed_at).toLocaleDateString('ar-EG')
                        : new Date(sup.created_at).toLocaleDateString('ar-EG')}
                    </span>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* Insurance status */}
                      {sup.insurance_company_id ? (
                        <span style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', border: `1.5px solid ${cfg.color}`, color: cfg.color, background: cfg.bg, fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                          {cfg.label}
                        </span>
                      ) : (
                        <span style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1.5px solid #e5e7eb', color: '#9ca3af', background: '#f9fafb', fontWeight: 600, fontSize: '0.78rem' }}>
                          بدون تأمين
                        </span>
                      )}
                      {/* Total */}
                      {total != null && (
                        <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.9rem' }}>
                          {total.toLocaleString()} ج.م
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {(imagesMap[sup.estimate_id]?.length ?? 0) > 0 && (
                        <button
                          onClick={() => setPhotosModal({
                            title: `ملحق ${idx + 1} · ${sup.vehicle_make} ${sup.vehicle_model} ${sup.vehicle_year}`,
                            images: imagesMap[sup.estimate_id],
                          })}
                          style={{ padding: '0.45rem 1rem', background: 'white', color: '#7c3aed', border: '1.5px solid #ddd6fe', borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                        >🖼 {imagesMap[sup.estimate_id].length} صور</button>
                      )}
                      <button
                        onClick={() => navigate(`/report/${sup.estimate_id}`)}
                        style={{ padding: '0.45rem 1rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                      >📄 عرض التقرير</button>
                    </div>
                  </div>

                  {/* Add another supplement row */}
                  {canAddSupplement && idx === supplements.length - 1 && (
                    <div style={{ borderTop: '1px dashed #e5e7eb', padding: '0.65rem 1.25rem', display: 'flex', justifyContent: 'center' }}>
                      <button
                        onClick={startNewSupplement}
                        style={{ background: 'none', border: 'none', color: '#7c3aed', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                      >➕ إضافة ملحق آخر</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>

      {photosModal && (
        <SupplementPhotosModal title={photosModal.title} images={photosModal.images} onClose={() => setPhotosModal(null)} />
      )}
    </div>
  )
}

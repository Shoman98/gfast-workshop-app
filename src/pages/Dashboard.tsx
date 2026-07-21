import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

interface Estimate {
  estimate_id: string
  vehicle_year: number
  vehicle_make: string
  vehicle_model: string
  status: 'draft' | 'confirmed' | 'exported'
  total_cost_min?: number
  total_cost_max?: number
  created_at: string
  parts: any[]
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
  const [estimateImages, setEstimateImages] = useState<Record<string, ImageRecord[]>>({})
  const [photosModal, setPhotosModal] = useState<Estimate | null>(null)

  const confirmedEstimates = estimates.filter((est) => est.status === 'confirmed')

  const filteredEstimates = confirmedEstimates.filter((est) => {
    const query = searchQuery.toLowerCase()
    const make = est.vehicle_make.toLowerCase()
    const model = est.vehicle_model.toLowerCase()
    const year = est.vehicle_year.toString()
    return make.includes(query) || model.includes(query) || year.includes(query)
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
      const confirmed: Estimate[] = (data.estimates || []).filter((e: Estimate) => e.status === 'confirmed')
      setEstimates(data.estimates || [])

      const imageResults = await Promise.all(
        confirmed.map(async (est) => {
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

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ar-EG')

  const handleLogout = () => { localStorage.clear(); navigate('/login') }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', direction: 'rtl' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white', borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', padding: '1rem 1.5rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb', margin: 0 }}>G-Fast</h1>
            {workshop && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem', margin: 0 }}>
                {workshop.workshop_name}
              </p>
            )}
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1.25rem', backgroundColor: '#dc2626', color: 'white',
              borderRadius: '0.5rem', fontWeight: '500', border: 'none', cursor: 'pointer',
            }}
          >🚪 خروج</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <button
          onClick={() => navigate('/analysis')}
          style={{
            marginBottom: '2rem', padding: '0.75rem 1.5rem', backgroundColor: '#2563eb',
            color: 'white', borderRadius: '0.5rem', fontWeight: 'bold',
            fontSize: '1.125rem', border: 'none', cursor: 'pointer',
          }}
        >➕ تقدير جديد</button>

        <div style={{
          backgroundColor: 'white', borderRadius: '0.75rem',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '2rem',
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#111827', marginTop: 0 }}>
            التقديرات المؤكدة
          </h2>

          {confirmedEstimates.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن الماركة أو الموديل أو السنة..."
                style={{
                  width: '100%', padding: '0.75rem 1rem', border: '2px solid #d1d5db',
                  borderRadius: '0.5rem', fontSize: '1rem', textAlign: 'right',
                  outline: 'none', transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
              />
              {searchQuery && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', marginBottom: 0 }}>
                  عدد النتائج: {filteredEstimates.length}
                </p>
              )}
            </div>
          )}

          {error && (
            <div style={{
              marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#fee2e2',
              borderRight: '4px solid #ef4444', borderRadius: '0.5rem', color: '#991b1b', fontWeight: '500',
            }}>⚠️ {error}</div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', paddingTop: '3rem', paddingBottom: '3rem' }}>
              <p style={{ color: '#6b7280' }}>⏳ جاري التحميل...</p>
            </div>
          ) : confirmedEstimates.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '3rem', paddingBottom: '3rem' }}>
              <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '1.125rem' }}>لا توجد تقديرات مؤكدة بعد</p>
              <button
                onClick={() => navigate('/analysis')}
                style={{
                  padding: '0.75rem 1.5rem', backgroundColor: '#2563eb', color: 'white',
                  borderRadius: '0.5rem', fontWeight: 'bold', border: 'none', cursor: 'pointer',
                }}
              >➕ إنشاء تقدير جديد</button>
            </div>
          ) : filteredEstimates.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '2rem', paddingBottom: '2rem' }}>
              <p style={{ color: '#6b7280', fontSize: '1rem' }}>لم يتم العثور على نتائج لـ "{searchQuery}"</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredEstimates.map((estimate) => {
                const imgs = estimateImages[estimate.estimate_id] || []
                return (
                  <div
                    key={estimate.estimate_id}
                    style={{
                      padding: '1rem', border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem', backgroundColor: '#f9fafb', direction: 'rtl',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {/* Vehicle info */}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '600', color: '#111827', fontSize: '0.95rem' }}>
                          {estimate.vehicle_make} {estimate.vehicle_model}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                          {estimate.vehicle_year} • {formatDate(estimate.created_at)}
                        </div>
                      </div>

                      {/* Buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {/* Photos button */}
                        <button
                          onClick={() => setPhotosModal(estimate)}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#7c3aed',
                            color: 'white',
                            borderRadius: '0.5rem',
                            fontWeight: 'bold',
                            fontSize: '0.875rem',
                            border: 'none',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          📷 صور
                          {imgs.length > 0 && (
                            <span style={{
                              backgroundColor: 'rgba(255,255,255,0.25)',
                              borderRadius: '999px',
                              padding: '0 0.4rem',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                            }}>{imgs.length}</span>
                          )}
                        </button>

                        {/* Report button */}
                        <button
                          onClick={() => navigate(`/report/${estimate.estimate_id}`)}
                          style={{
                            padding: '0.5rem 1rem', backgroundColor: '#16a34a', color: 'white',
                            borderRadius: '0.5rem', fontWeight: 'bold', fontSize: '0.875rem',
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >📄 تقرير</button>
                      </div>
                    </div>

                    {/* Thumbnail strip */}
                    {imgs.length > 0 && (
                      <div
                        style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', flexWrap: 'wrap', cursor: 'pointer' }}
                        onClick={() => setPhotosModal(estimate)}
                      >
                        {imgs.slice(0, 6).map((img, i) => (
                          <img
                            key={i}
                            src={img.cloudinary_url}
                            alt=""
                            style={{
                              width: '52px', height: '52px', objectFit: 'cover',
                              borderRadius: '6px', border: '1px solid #e5e7eb',
                            }}
                          />
                        ))}
                        {imgs.length > 6 && (
                          <div style={{
                            width: '52px', height: '52px', borderRadius: '6px',
                            border: '1px solid #e5e7eb', backgroundColor: '#ede9fe',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', color: '#7c3aed', fontWeight: '700',
                          }}>+{imgs.length - 6}</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Photos Modal */}
      {photosModal && (
        <PhotosModal
          estimate={photosModal}
          images={estimateImages[photosModal.estimate_id] || []}
          onClose={() => setPhotosModal(null)}
        />
      )}
    </div>
  )
}

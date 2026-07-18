import { useState, useEffect } from 'react'
import { apiUrl } from '@/lib/api'

interface ImageData {
  id: string
  cloudinary_url: string
  cloudinary_public_id: string
  uploaded_at: string
}

interface ImageModalProps {
  estimateId: string
  isOpen: boolean
  onClose: () => void
  readOnly?: boolean
}

export default function ImageModal({ estimateId, isOpen, onClose }: ImageModalProps) {
  const [images, setImages] = useState<ImageData[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadImages()
    }
  }, [isOpen, estimateId])

  const loadImages = async () => {
    try {
      setLoading(true)
      const res = await fetch(apiUrl(`/api/images?estimate_id=${estimateId}`))
      if (!res.ok) throw new Error('فشل تحميل الصور')
      const data = await res.json()
      setImages(data.images || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      setError('')

      // Prepare FormData for Cloudinary
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET)

      // Upload directly to Cloudinary
      const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`
      const cloudRes = await fetch(cloudinaryUrl, {
        method: 'POST',
        body: formData
      })

      if (!cloudRes.ok) throw new Error('فشل رفع الصورة إلى Cloudinary')
      const cloudData = await cloudRes.json()

      // Save reference to database
      const dbRes = await fetch(apiUrl('/api/images'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimate_id: estimateId,
          cloudinary_public_id: cloudData.public_id,
          cloudinary_url: cloudData.secure_url,
          uploaded_by: 'workshop'
        })
      })

      if (!dbRes.ok) throw new Error('فشل حفظ الصورة')
      await loadImages()
      e.target.value = '' // Reset file input
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (imageId: string) => {
    if (!confirm('حذف هذه الصورة؟')) return

    try {
      const res = await fetch(apiUrl(`/api/images/${imageId}`), { method: 'DELETE' })
      if (!res.ok) throw new Error('فشل حذف الصورة')
      await loadImages()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '1rem',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        direction: 'rtl'
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>الصور</h2>
          <button onClick={onClose} style={{
            border: 'none',
            background: 'none',
            fontSize: '1.5rem',
            color: '#9ca3af',
            cursor: 'pointer'
          }}>×</button>
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '1.5rem' }}>
          {error && (
            <div style={{
              background: '#fee2e2',
              color: '#dc2626',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              fontSize: '0.9rem'
            }}>
              {error}
            </div>
          )}

          {/* Upload Area - Hidden in read-only mode */}
          {!readOnly && (
            <div style={{
              border: '2px dashed #3b82f6',
              borderRadius: '0.75rem',
              padding: '2rem',
              textAlign: 'center',
              marginBottom: '1.5rem',
              background: '#eff6ff'
            }}>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={uploading}
                style={{ display: 'none' }}
                id="image-upload"
              />
              <label htmlFor="image-upload" style={{
                display: 'block',
                cursor: uploading ? 'not-allowed' : 'pointer',
                opacity: uploading ? 0.5 : 1
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📸</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e40af', marginBottom: '0.25rem' }}>
                  {uploading ? 'جاري الرفع...' : 'انقر أو اسحب الصور'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  JPG, PNG, الحد الأقصى 10MB
                </div>
              </label>
            </div>
          )}

          {/* Images Grid */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>جاري التحميل...</div>
          ) : images.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
              لا توجد صور حتى الآن
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '1rem'
            }}>
              {images.map(img => (
                <div key={img.id} style={{
                  position: 'relative',
                  borderRadius: '0.75rem',
                  overflow: 'hidden',
                  background: '#f3f4f6',
                  aspectRatio: '1/1'
                }}>
                  <img
                    src={img.cloudinary_url}
                    alt="Estimate image"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {!readOnly && (
                    <button
                      onClick={() => handleDelete(img.id)}
                      style={{
                        position: 'absolute',
                        top: '0.5rem',
                        left: '0.5rem',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '999px',
                        width: '32px',
                        height: '32px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        transition: 'background .2s'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#dc2626')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#ef4444')}
                    >
                      ×
                    </button>
                  )}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    padding: '0.5rem',
                    fontSize: '0.7rem',
                    textAlign: 'center'
                  }}>
                    {new Date(img.uploaded_at).toLocaleDateString('ar-EG')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button onClick={onClose} style={{
            padding: '0.5rem 1.5rem',
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem',
            color: '#374151'
          }}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}

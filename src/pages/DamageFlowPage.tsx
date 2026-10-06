import { useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

function getSession() {
  try { return JSON.parse(localStorage.getItem('customer_session') || '{}') } catch { return {} }
}
function authHeader() {
  return { Authorization: `Bearer ${getSession().token || ''}`, 'Content-Type': 'application/json' }
}

export default function DamageFlowPage() {
  const { policyId } = useParams()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const addImages = (files: FileList | null) => {
    if (!files) return
    const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (newFiles.length === 0) { setError('يرجى اختيار ملفات صور فقط'); return }
    setImages(prev => [...prev, ...newFiles])
    setError('')
  }

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const submit = async () => {
    if (images.length === 0 || !description) { setError('أضف صورة واكتب وصف الحادثة'); return }
    setUploading(true); setError('')
    try {
      // Convert images to base64
      const imagePromises = images.map(img => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(img)
      }))
      const imageDataUrls = await Promise.all(imagePromises)

      // Call analysis endpoint
      const res = await fetch(apiUrl('/api/analysis'), {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
          images: imageDataUrls,
          vehicleInfo: { year: 2020, make: 'معلومات السيارة', model: '' },
          imageViews: images.map((_, i) => `damage_${i}`),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل تحليل الأضرار')

      // Navigate to results page with analysis data
      navigate(`/customer/policy/${policyId}/damage-results`, {
        state: { analysis: data.analysis, description }
      })
    } catch (e: any) {
      setError(e.message)
      setUploading(false)
    }
  }

  const page: React.CSSProperties = {
    minHeight: '100dvh', background: '#f8fafc', direction: 'rtl',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }

  return (
    <div style={page}>
      <div style={{ background: '#1e3a8a', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: 1 }}>G-FAST</span>
        <button onClick={() => navigate('/customer/dashboard')} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: '.82rem' }}>← رجوع</button>
      </div>

      <div style={{ maxWidth: 580, margin: 'clamp(20px,5vw,40px) auto', padding: '0 clamp(12px,4vw,16px)', width: '100%', boxSizing: 'border-box' }}>
        <h1 style={{ fontWeight: 800, fontSize: '1.4rem', color: '#0f172a', marginBottom: 6 }}>تحميل صور الأضرار</h1>
        <p style={{ color: '#64748b', fontSize: '.9rem', marginBottom: 28 }}>
          أرسل صور السيارة المضرورة مع وصف تفصيلي للحادثة
        </p>

        {error && (
          <div style={{ marginBottom: 16, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '.88rem' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Image upload */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>صور الأضرار *</label>
          <button onClick={() => fileRef.current?.click()}
            style={{ width: '100%', padding: '40px 20px', border: '2px dashed #cbd5e1', borderRadius: 14, background: '#fff', cursor: 'pointer', transition: 'all .2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '2.2rem' }}>📸</span>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>اضغط أو اسحب الصور</div>
            <div style={{ fontSize: '.82rem', color: '#94a3b8' }}>الحد الأقصى: 5 صور</div>
          </button>
          <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
            onChange={e => addImages(e.target.files)} />
        </div>

        {/* Images list */}
        {images.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: '.85rem', fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
              {images.length} صور مختارة
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative', paddingTop: '100%', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                  <img src={URL.createObjectURL(img)} alt={`damage-${i}`}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => removeImage(i)}
                    style={{ position: 'absolute', top: 2, right: 2, background: '#dc2626', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: '1rem', padding: 0 }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 700, color: '#0f172a', marginBottom: 8, fontSize: '.9rem' }}>وصف الحادثة *</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="اشرح ما حدث وموقع الأضرار…" rows={5}
            style={{ width: '100%', padding: '12px', border: '2px solid #d1d5db', borderRadius: 8, fontSize: '.9rem', fontFamily: 'inherit', resize: 'none' }} />
          <div style={{ fontSize: '.78rem', color: '#94a3b8', marginTop: 4 }}>
            {description.length}/500 أحرف
          </div>
        </div>

        <button onClick={submit} disabled={uploading || images.length === 0}
          style={{
            width: '100%', padding: '12px', background: uploading || images.length === 0 ? '#9ca3af' : '#1e3a8a',
            color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.95rem',
            cursor: uploading || images.length === 0 ? 'not-allowed' : 'pointer',
          }}>
          {uploading ? '⏳ جاري التحليل…' : '🔍 تحليل الأضرار'}
        </button>
      </div>
    </div>
  )
}

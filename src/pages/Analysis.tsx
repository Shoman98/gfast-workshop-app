import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AnalysisPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [generalImages, setGeneralImages] = useState<File[]>([])
  const [damageImages, setDamageImages] = useState<File[]>([])
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'general' | 'damage') => {
    const files = Array.from(e.target.files || [])
    if (type === 'general') {
      setGeneralImages([...generalImages, ...files])
    } else {
      setDamageImages([...damageImages, ...files])
    }
  }

  const removeImage = (index: number, type: 'general' | 'damage') => {
    if (type === 'general') {
      setGeneralImages(generalImages.filter((_, i) => i !== index))
    } else {
      setDamageImages(damageImages.filter((_, i) => i !== index))
    }
  }

  const compressImage = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let { width, height } = img
          if (width > height) {
            if (width > 1024) {
              height = Math.round((height * 1024) / width)
              width = 1024
            }
          } else {
            if (height > 1024) {
              width = Math.round((width * 1024) / height)
              height = 1024
            }
          }
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.65))
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  const handleAnalyze = async () => {
    setError('')

    const totalImages = generalImages.length + damageImages.length

    if (totalImages < 1) {
      setError('يجب رفع صورة واحدة على الأقل')
      return
    }

    if (!year || !make || !model) {
      setError('يرجى إدخال معلومات المركبة')
      return
    }

    setAnalyzing(true)

    try {
      const allImages = [...generalImages, ...damageImages]
      const compressedImages: string[] = []

      for (const file of allImages) {
        const compressed = await compressImage(file)
        compressedImages.push(compressed.split(',')[1])
      }

      const token = localStorage.getItem('token')
      if (!token) {
        setError('انتهت جلستك. يرجى تسجيل الدخول مجددا')
        navigate('/login')
        return
      }

      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          images: compressedImages,
          vehicleInfo: {
            year: parseInt(year),
            make,
            model,
          },
          imageViews: generalImages.length > 0 ? ['front'] : [],
          imageAngles: damageImages.length > 0 ? ['close'] : [],
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'فشل التحليل')
      }

      if (data.success && data.analysis) {
        console.log('✅ Analysis received:', {
          damages: data.analysis.damages?.length || 0,
          needs_check: data.analysis.needs_check_parts?.length || 0,
          full_response: data.analysis
        });
        sessionStorage.setItem('analysisResult', JSON.stringify(data.analysis))
        sessionStorage.setItem('vehicleInfo', JSON.stringify({
          year: parseInt(year),
          make,
          model,
        }))
        navigate('/estimate/new')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحليل')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', direction: 'rtl' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{
          maxWidth: '80rem',
          margin: '0 auto',
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>تحليل المركبة</h1>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              color: '#2563eb',
              fontWeight: '500',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            ← العودة
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          padding: '2rem',
        }}>
          {/* Vehicle Info */}
          <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#111827' }}>معلومات المركبة</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>السنة</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2023"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '0.5rem',
                    textAlign: 'right',
                    outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>الماركة</label>
                <input
                  type="text"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="تويوتا"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '0.5rem',
                    textAlign: 'right',
                    outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>الموديل</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="كامري"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '0.5rem',
                    textAlign: 'right',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          {/* General Images */}
          <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#111827' }}>الصور العامة</h2>
            <button
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.multiple = true
                input.accept = 'image/*'
                input.onchange = (e) => handleImageSelect(e as any, 'general')
                input.click()
              }}
              style={{
                width: '100%',
                padding: '2rem 1.5rem',
                border: '2px dashed #d1d5db',
                borderRadius: '0.5rem',
                backgroundColor: '#f9fafb',
                color: '#4b5563',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginBottom: '1rem',
              }}
            >
              📷 اضغط لاختيار صور
            </button>
            {generalImages.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                {generalImages.map((img, idx) => (
                  <div key={idx} style={{ position: 'relative', cursor: 'pointer' }} onClick={() => removeImage(idx, 'general')}>
                    <img
                      src={URL.createObjectURL(img)}
                      alt={`صورة ${idx}`}
                      style={{ width: '100%', height: '6rem', objectFit: 'cover', borderRadius: '0.5rem' }}
                    />
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      opacity: 0,
                      transition: 'opacity 0.2s',
                    }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}>
                      ❌
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{generalImages.length} صور مختارة</p>
          </div>

          {/* Damage Images */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#111827' }}>صور الأضرار</h2>
            <button
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.multiple = true
                input.accept = 'image/*'
                input.onchange = (e) => handleImageSelect(e as any, 'damage')
                input.click()
              }}
              style={{
                width: '100%',
                padding: '2rem 1.5rem',
                border: '2px dashed #d1d5db',
                borderRadius: '0.5rem',
                backgroundColor: '#f9fafb',
                color: '#4b5563',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginBottom: '1rem',
              }}
            >
              📸 اضغط لاختيار صور الأضرار
            </button>
            {damageImages.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                {damageImages.map((img, idx) => (
                  <div key={idx} style={{ position: 'relative', cursor: 'pointer' }} onClick={() => removeImage(idx, 'damage')}>
                    <img
                      src={URL.createObjectURL(img)}
                      alt={`صورة ضرر ${idx}`}
                      style={{ width: '100%', height: '6rem', objectFit: 'cover', borderRadius: '0.5rem' }}
                    />
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      opacity: 0,
                      transition: 'opacity 0.2s',
                    }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}>
                      ❌
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{damageImages.length} صور مختارة</p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              backgroundColor: '#fee2e2',
              borderRight: '4px solid #ef4444',
              borderRadius: '0.5rem',
              color: '#991b1b',
              fontWeight: '500',
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleAnalyze}
              disabled={analyzing || generalImages.length + damageImages.length < 1}
              style={{
                flex: 1,
                padding: '1rem 1.5rem',
                backgroundColor: (analyzing || generalImages.length + damageImages.length < 1) ? '#9ca3af' : '#2563eb',
                color: 'white',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                fontSize: '1.125rem',
                border: 'none',
                cursor: (analyzing || generalImages.length + damageImages.length < 1) ? 'not-allowed' : 'pointer',
              }}
              title={generalImages.length + damageImages.length < 1 ? 'يجب رفع صورة واحدة على الأقل' : ''}
            >
              {analyzing ? '⏳ جاري التحليل...' : `🔍 تحليل المركبة (${generalImages.length + damageImages.length})`}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '1rem 1.5rem',
                border: '2px solid #d1d5db',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              ← إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

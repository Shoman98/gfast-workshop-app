import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import { INSURANCE_COMPANIES } from '@/mock/insurance'
import vehiclesData from '@/data/vehicles.json'

const VEHICLES: Record<string, string[]> = vehiclesData
const BRANDS = Object.keys(VEHICLES).sort()
const YEARS = Array.from({ length: 2027 - 2000 + 1 }, (_, i) => String(2027 - i))

interface SearchableSelectProps {
  label: string
  placeholder: string
  options: string[]
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

function SearchableSelect({ label, placeholder, options, value, onChange, disabled }: SearchableSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (opt: string) => {
    onChange(opt)
    setQuery('')
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: '#374151', marginBottom: '0.4rem' }}>
        {label}
      </label>
      <div
        onClick={() => { if (!disabled) { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) } }}
        style={{
          display: 'flex',
          alignItems: 'center',
          border: `2px solid ${open ? '#2563eb' : '#d1d5db'}`,
          borderRadius: '0.6rem',
          backgroundColor: disabled ? '#f3f4f6' : 'white',
          cursor: disabled ? 'not-allowed' : 'pointer',
          overflow: 'hidden',
          minHeight: '48px',
          transition: 'border-color 0.15s',
        }}
      >
        <input
          ref={inputRef}
          value={open ? query : value}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (!disabled) setOpen(true) }}
          placeholder={open ? 'ابحث...' : (value || placeholder)}
          disabled={disabled}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            padding: '0.75rem 1rem',
            fontSize: '1rem',
            textAlign: 'right',
            direction: 'rtl',
            backgroundColor: 'transparent',
            color: value && !open ? '#111827' : open ? '#111827' : '#9ca3af',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
        {value && !open && (
          <button onClick={handleClear} style={{ background: 'none', border: 'none', padding: '0 0.75rem', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', lineHeight: 1 }}>✕</button>
        )}
        <span style={{ padding: '0 0.75rem', color: '#9ca3af', fontSize: '0.8rem', pointerEvents: 'none' }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0, right: 0,
          backgroundColor: 'white',
          border: '1.5px solid #e5e7eb',
          borderRadius: '0.6rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 999,
          maxHeight: '220px',
          overflowY: 'auto',
          direction: 'rtl',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '1rem', color: '#9ca3af', textAlign: 'center', fontSize: '0.9rem' }}>لا توجد نتائج</div>
          ) : (
            filtered.map(opt => (
              <div
                key={opt}
                onMouseDown={() => handleSelect(opt)}
                style={{
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  color: opt === value ? '#2563eb' : '#111827',
                  backgroundColor: opt === value ? '#eff6ff' : 'transparent',
                  fontWeight: opt === value ? '600' : '400',
                  borderBottom: '1px solid #f3f4f6',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (opt !== value) (e.currentTarget as HTMLElement).style.backgroundColor = '#f9fafb' }}
                onMouseLeave={e => { if (opt !== value) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
              >
                {opt}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function AnalysisPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [generalImages, setGeneralImages] = useState<File[]>([])
  const [damageImages, setDamageImages] = useState<File[]>([])
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [vinNumber, setVinNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerMobile, setCustomerMobile] = useState('')
  const [insuranceCompanyId, setInsuranceCompanyId] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [parentEstimateId, setParentEstimateId] = useState<string | null>(null)
  const [isSupplementary, setIsSupplementary] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('supplementData')
    if (!raw) return
    sessionStorage.removeItem('supplementData')
    const sup = JSON.parse(raw)
    setParentEstimateId(sup.parentEstimateId)
    setIsSupplementary(true)
    if (sup.vehicle) {
      setYear(String(sup.vehicle.year || ''))
      setMake(sup.vehicle.make || '')
      setModel(sup.vehicle.model || '')
      setVinNumber(sup.vehicle.vin_number || '')
      setCustomerName(sup.vehicle.customer_name || '')
      setCustomerMobile(sup.vehicle.customer_mobile || '')
      setInsuranceCompanyId(sup.vehicle.insurance_company_id || '')
    }
  }, [])

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


  const handleAnalyze = async () => {
    setError('')

    const totalImages = generalImages.length + damageImages.length

    if (totalImages < 1) {
      setError('يجب رفع صورة واحدة على الأقل')
      return
    }

    if (!year || !make || !model || !vinNumber || !customerName || !customerMobile) {
      setError('يرجى إدخال جميع البيانات المطلوبة (المركبة وبيانات العميل ورقم الشاسيه)')
      return
    }

    setAnalyzing(true)

    try {
      const allImages = [...generalImages, ...damageImages]
      const rawImages: string[] = []

      // Send raw images (no frontend compression)
      // Backend shared module handles compression for Gemini
      for (const file of allImages) {
        const reader = new FileReader()
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = (e) => {
            const result = e.target?.result as string
            resolve(result.split(',')[1])
          }
          reader.readAsDataURL(file)
        })
        rawImages.push(base64)
      }

      const token = localStorage.getItem('token')
      if (!token) {
        setError('انتهت جلستك. يرجى تسجيل الدخول مجددا')
        navigate('/login')
        return
      }

      const response = await fetch(apiUrl('/api/analysis'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          images: rawImages,
          vehicleInfo: {
            year: parseInt(year) || 0,
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

        // Store images as base64 for later upload after estimate confirmation
        const allImages = [...generalImages, ...damageImages]
        if (allImages.length > 0) {
          const imagePromises = allImages.map(file => {
            return new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onload = (e) => {
                resolve(e.target?.result as string)
              }
              reader.readAsDataURL(file)
            })
          })
          const imageBase64Array = await Promise.all(imagePromises)
          sessionStorage.setItem('analysisImages', JSON.stringify(imageBase64Array))
          console.log('📸 Stored', imageBase64Array.length, 'images for upload after confirmation')
        }

        sessionStorage.setItem('analysisResult', JSON.stringify(data.analysis))
        sessionStorage.setItem('vehicleInfo', JSON.stringify({
          year: parseInt(year) || 0,
          make,
          model,
          vin_number: vinNumber,
          customer_name: customerName,
          customer_mobile: customerMobile,
          insurance_company_id: insuranceCompanyId || null,
          parent_estimate_id: parentEstimateId || null,
        }))
        sessionStorage.removeItem('supplementData')
        const isInsurance = window.location.pathname.startsWith('/insurance')
        navigate(isInsurance ? '/insurance/estimate/new' : '/estimate/new')
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, color: '#111827' }}>معلومات المركبة</h2>
              {isSupplementary && <span style={{ background: '#f5f3ff', color: '#7c3aed', border: '1.5px solid #ddd6fe', borderRadius: '999px', padding: '0.2rem 0.85rem', fontSize: '0.78rem', fontWeight: 700 }}>تقدير تكميلي</span>}
            </div>
            {isSupplementary ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                {[
                  ['الماركة', make],
                  ['الموديل', model],
                  ['السنة', year],
                  ['رقم الشاسيه', vinNumber],
                  ['شركة التأمين', insuranceCompanyId ? (INSURANCE_COMPANIES.find(c => c.id === insuranceCompanyId)?.nameAr || insuranceCompanyId) : '—'],
                ].map(([label, val]) => (
                  <div key={label}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: '#374151', marginBottom: '0.4rem' }}>{label}</label>
                    <div style={{ padding: '0.75rem 1rem', background: '#f3f4f6', border: '2px solid #e5e7eb', borderRadius: '0.5rem', color: '#374151', fontWeight: 600 }}>{val || '—'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <SearchableSelect label="الماركة" placeholder="-- اختر الماركة --" options={BRANDS} value={make} onChange={(v) => { setMake(v); setModel('') }} />
                  <SearchableSelect label="الموديل" placeholder={make ? '-- اختر الموديل --' : 'اختر الماركة أولاً'} options={VEHICLES[make] || []} value={model} onChange={setModel} disabled={!make} />
                  <SearchableSelect label="السنة" placeholder="-- اختر السنة --" options={YEARS} value={year} onChange={setYear} />
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>رقم الشاسيه (VIN)</label>
                  <input type="text" value={vinNumber} onChange={(e) => setVinNumber(e.target.value)} placeholder="WBADT43452G296706" style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #d1d5db', borderRadius: '0.5rem', textAlign: 'right', outline: 'none' }} />
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>
                    شركة التأمين <span style={{ color: '#9ca3af', fontWeight: 400 }}>(اختياري)</span>
                  </label>
                  <select value={insuranceCompanyId} onChange={(e) => setInsuranceCompanyId(e.target.value)} style={{ width: '100%', padding: '0.75rem 1rem', border: '2px solid #d1d5db', borderRadius: '0.5rem', textAlign: 'right', outline: 'none', backgroundColor: 'white', fontSize: '0.95rem', color: insuranceCompanyId ? '#111827' : '#9ca3af' }}>
                    <option value="">-- بدون شركة تأمين --</option>
                    {INSURANCE_COMPANIES.map((c) => (<option key={c.id} value={c.id}>{c.nameAr}</option>))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Customer Details */}
          <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#111827' }}>بيانات العميل</h2>
            {isSupplementary ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                {[['اسم العميل', customerName], ['رقم الهاتف', customerMobile]].map(([label, val]) => (
                  <div key={label}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: '#374151', marginBottom: '0.4rem' }}>{label}</label>
                    <div style={{ padding: '0.75rem 1rem', background: '#f3f4f6', border: '2px solid #e5e7eb', borderRadius: '0.5rem', color: '#374151', fontWeight: 600 }}>{val || '—'}</div>
                  </div>
                ))}
              </div>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>اسم العميل</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="أحمد محمد"
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
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>رقم الهاتف</label>
                <input
                  type="tel"
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                  placeholder="01001234567"
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
            )}
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

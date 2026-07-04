import { useState, useRef } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { useNavigate } from 'react-router-dom'

interface AnalysisResult {
  success: boolean
  duration: number
  analysis: {
    damages: Array<{
      part_name_en: string
      part_name_ar: string
      damage_type: string
      confidence: number
      severity_label: string
      price: number
      is_ai_detected: boolean
    }>
    needs_check_parts: Array<string>
  }
}

export default function AnalysisPage() {
  const { t, lang } = useLanguage()
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

    if (generalImages.length === 0 && damageImages.length === 0) {
      setError(t('error') + ': ' + t('uploadImages'))
      return
    }

    if (!year || !make || !model) {
      setError(t('error') + ': Vehicle info required')
      return
    }

    setAnalyzing(true)

    try {
      // Compress images
      const allImages = [...generalImages, ...damageImages]
      const compressedImages: string[] = []

      for (const file of allImages) {
        const compressed = await compressImage(file)
        compressedImages.push(compressed.split(',')[1]) // Get base64 without data URI prefix
      }

      // Get token from localStorage
      const token = localStorage.getItem('token')
      if (!token) {
        setError('Session expired. Please login again.')
        navigate('/login')
        return
      }

      // Call analysis endpoint
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

      const data: AnalysisResult = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed')
      }

      if (data.success && data.analysis) {
        // Store analysis result in sessionStorage
        sessionStorage.setItem('analysisResult', JSON.stringify(data.analysis))
        // Navigate to estimate page to confirm
        navigate('/estimate/new')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className={`min-h-screen p-8 bg-gfast-g50 ${lang === 'ar' ? 'rtl' : 'ltr'}`}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gfast-blue hover:underline mb-4"
          >
            ← {t('dashboard')}
          </button>
          <h1 className="text-3xl font-bold">{t('analysis')}</h1>
        </div>

        <div className="bg-white rounded-2lg shadow-lg p-8 space-y-8">
          {/* Vehicle Information */}
          <div className="border-b pb-6">
            <h2 className="text-xl font-bold mb-4">{t('vehicle')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gfast-g700 mb-2">
                  {t('year')}
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2023"
                  className="w-full px-4 py-2 border border-gfast-g300 rounded-lg focus:outline-none focus:border-gfast-blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gfast-g700 mb-2">
                  {t('carBrand')}
                </label>
                <input
                  type="text"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="Toyota"
                  className="w-full px-4 py-2 border border-gfast-g300 rounded-lg focus:outline-none focus:border-gfast-blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gfast-g700 mb-2">
                  {t('carModel')}
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Corolla"
                  className="w-full px-4 py-2 border border-gfast-g300 rounded-lg focus:outline-none focus:border-gfast-blue"
                />
              </div>
            </div>
          </div>

          {/* General Images */}
          <div className="border-b pb-6">
            <h2 className="text-lg font-bold mb-4">{t('generalImages')}</h2>
            <div className="space-y-4">
              <button
                onClick={() => {
                  fileInputRef.current?.click()
                }}
                className="w-full px-6 py-4 border-2 border-dashed border-gfast-g300 rounded-lg hover:border-gfast-blue hover:bg-blue-50 transition-colors"
              >
                + {t('uploadImages')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                hidden
                onChange={(e) => handleImageSelect(e, 'general')}
              />
              {generalImages.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {generalImages.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={URL.createObjectURL(img)}
                        alt={`General ${idx}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => removeImage(idx, 'general')}
                        className="absolute inset-0 bg-black bg-opacity-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Damage Images */}
          <div className="border-b pb-6">
            <h2 className="text-lg font-bold mb-4">{t('damageImages')}</h2>
            <div className="space-y-4">
              <button
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.multiple = true
                  input.accept = 'image/*'
                  input.onchange = (e) => {
                    const evt = e as any
                    handleImageSelect(evt, 'damage')
                  }
                  input.click()
                }}
                className="w-full px-6 py-4 border-2 border-dashed border-gfast-g300 rounded-lg hover:border-gfast-blue hover:bg-blue-50 transition-colors"
              >
                + {t('uploadImages')}
              </button>
              {damageImages.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {damageImages.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={URL.createObjectURL(img)}
                        alt={`Damage ${idx}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => removeImage(idx, 'damage')}
                        className="absolute inset-0 bg-black bg-opacity-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* Analyze Button */}
          <div className="flex gap-4">
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex-1 px-6 py-3 bg-gfast-blue text-white rounded-lg font-semibold hover:bg-gfast-blue-dark disabled:bg-gfast-g400 transition-colors"
            >
              {analyzing ? t('analyzing') : t('analyzeButton')}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 border border-gfast-g300 rounded-lg font-semibold hover:bg-gfast-g50"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

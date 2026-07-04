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

    if (generalImages.length === 0 && damageImages.length === 0) {
      setError('يرجى رفع صور للمركبة')
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
        sessionStorage.setItem('analysisResult', JSON.stringify(data.analysis))
        navigate('/estimate/new')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحليل')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 rtl" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">تحليل المركبة</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-blue-600 hover:underline font-medium"
          >
            ← العودة
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Vehicle Info Section */}
          <div className="mb-8 pb-8 border-b border-gray-200">
            <h2 className="text-xl font-bold mb-6 text-gray-800">معلومات المركبة</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">السنة</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2023"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 text-right"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">الماركة</label>
                <input
                  type="text"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="تويوتا"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 text-right"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">الموديل</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="كامري"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 text-right"
                />
              </div>
            </div>
          </div>

          {/* General Images Section */}
          <div className="mb-8 pb-8 border-b border-gray-200">
            <h2 className="text-xl font-bold mb-6 text-gray-800">الصور العامة</h2>
            <div className="space-y-4">
              <button
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.multiple = true
                  input.accept = 'image/*'
                  input.onchange = (e) => {
                    const evt = e as any
                    handleImageSelect(evt, 'general')
                  }
                  input.click()
                }}
                className="w-full px-6 py-8 border-2 border-dashed border-gray-400 rounded-lg hover:border-blue-600 hover:bg-blue-50 transition-colors text-gray-700 font-bold"
              >
                📷 اضغط لاختيار صور
              </button>
              {generalImages.length > 0 && (
                <div className="grid grid-cols-4 gap-4">
                  {generalImages.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={URL.createObjectURL(img)}
                        alt={`صورة ${idx}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => removeImage(idx, 'general')}
                        className="absolute inset-0 bg-black bg-opacity-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-sm text-gray-500">
                {generalImages.length} صور مختارة
              </p>
            </div>
          </div>

          {/* Damage Images Section */}
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-6 text-gray-800">صور الأضرار</h2>
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
                className="w-full px-6 py-8 border-2 border-dashed border-gray-400 rounded-lg hover:border-blue-600 hover:bg-blue-50 transition-colors text-gray-700 font-bold"
              >
                📸 اضغط لاختيار صور الأضرار
              </button>
              {damageImages.length > 0 && (
                <div className="grid grid-cols-4 gap-4">
                  {damageImages.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={URL.createObjectURL(img)}
                        alt={`صورة ضرر ${idx}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => removeImage(idx, 'damage')}
                        className="absolute inset-0 bg-black bg-opacity-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-sm text-gray-500">
                {damageImages.length} صور مختارة
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-100 border-r-4 border-red-500 text-red-700 rounded-lg font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-lg font-bold text-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {analyzing ? '⏳ جاري التحليل...' : '🔍 تحليل المركبة'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-4 border-2 border-gray-300 rounded-lg font-bold hover:bg-gray-50 transition-colors"
            >
              ← إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

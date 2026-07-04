import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

interface Part {
  id?: string
  part_name_en: string
  part_name_ar: string
  damage_type: string
  confidence?: number
  severity_label: 'Repair' | 'Replace'
  price: number
  is_ai_detected?: boolean
}

export default function EstimatePage() {
  const { estimateId } = useParams()
  const navigate = useNavigate()
  const [parts, setParts] = useState<Part[]>([])
  const [newPart, setNewPart] = useState<Part>({
    part_name_en: '',
    part_name_ar: '',
    damage_type: 'Unknown',
    severity_label: 'Repair',
    price: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (estimateId === 'new') {
      const analysisResult = sessionStorage.getItem('analysisResult')
      if (analysisResult) {
        const analysis = JSON.parse(analysisResult)
        setParts(analysis.damages || [])
        sessionStorage.removeItem('analysisResult')
      }
    }
  }, [estimateId])

  const updatePart = (index: number, field: keyof Part, value: any) => {
    const updated = [...parts]
    updated[index] = { ...updated[index], [field]: value }
    setParts(updated)
  }

  const removePart = (index: number) => {
    setParts(parts.filter((_, i) => i !== index))
  }

  const addPart = () => {
    if (!newPart.part_name_ar.trim()) {
      setError('يرجى إدخال اسم الجزء')
      return
    }
    setParts([...parts, { ...newPart }])
    setNewPart({
      part_name_en: '',
      part_name_ar: '',
      damage_type: 'Unknown',
      severity_label: 'Repair',
      price: 0,
    })
    setError('')
  }

  const handleConfirm = async () => {
    if (parts.length === 0) {
      setError('يرجى إضافة جزء واحد على الأقل')
      return
    }

    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login')
      return
    }

    try {
      setConfirming(true)
      setError('')

      if (estimateId === 'new') {
        const response = await fetch('/api/estimates', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            vehicle_year: 2023,
            vehicle_make: 'Unknown',
            vehicle_model: 'Unknown',
            parts,
          }),
        })

        if (!response.ok) throw new Error('فشل إنشاء التقدير')

        const data = await response.json()
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت العملية')
    } finally {
      setConfirming(false)
    }
  }

  const totalPrice = parts.reduce((sum, p) => sum + (p.price || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 rtl" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">تحرير التقدير</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-blue-600 hover:underline font-medium"
          >
            ← العودة
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-100 border-r-4 border-red-500 text-red-700 rounded-lg font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* Parts Table */}
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-6 text-gray-800">قائمة الأجزاء</h2>

            {parts.length > 0 ? (
              <div className="overflow-x-auto mb-6">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-300 bg-gray-50">
                      <th className="text-right py-4 px-6 font-bold text-gray-700">الجزء</th>
                      <th className="text-right py-4 px-6 font-bold text-gray-700">نوع الضرر</th>
                      <th className="text-right py-4 px-6 font-bold text-gray-700">الحالة</th>
                      <th className="text-right py-4 px-6 font-bold text-gray-700">السعر</th>
                      <th className="text-center py-4 px-6 font-bold text-gray-700">حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((part, idx) => (
                      <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <div className="font-semibold text-gray-900">{part.part_name_ar}</div>
                          {part.confidence && (
                            <div className="text-xs text-gray-500 mt-1">
                              {Math.round(part.confidence * 100)}% ثقة
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <input
                            type="text"
                            value={part.damage_type}
                            onChange={(e) => updatePart(idx, 'damage_type', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-right"
                          />
                        </td>
                        <td className="py-4 px-6">
                          <select
                            value={part.severity_label}
                            onChange={(e) =>
                              updatePart(idx, 'severity_label', e.target.value as any)
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded text-right"
                          >
                            <option value="Repair">إصلاح</option>
                            <option value="Replace">استبدال</option>
                          </select>
                        </td>
                        <td className="py-4 px-6">
                          <input
                            type="number"
                            value={part.price}
                            onChange={(e) =>
                              updatePart(idx, 'price', parseFloat(e.target.value) || 0)
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded text-right"
                          />
                        </td>
                        <td className="py-4 px-6 text-center">
                          <button
                            onClick={() => removePart(idx)}
                            className="text-red-600 hover:text-red-800 font-bold"
                          >
                            ❌
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-600">
                لا توجد أجزاء بعد
              </div>
            )}

            {/* Total */}
            <div className="p-6 bg-blue-50 rounded-lg flex justify-between items-center border-r-4 border-blue-600">
              <span className="text-lg font-bold text-gray-700">الإجمالي:</span>
              <span className="text-3xl font-bold text-blue-600">
                {totalPrice.toLocaleString()} ج.م
              </span>
            </div>
          </div>

          {/* Add New Part */}
          <div className="mb-8 p-6 bg-gray-50 rounded-lg border-2 border-gray-200">
            <h3 className="text-lg font-bold mb-6 text-gray-800">إضافة جزء جديد</h3>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <input
                type="text"
                placeholder="الجزء (عربي)"
                value={newPart.part_name_ar}
                onChange={(e) => setNewPart({ ...newPart, part_name_ar: e.target.value })}
                className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 text-right"
              />
              <input
                type="text"
                placeholder="نوع الضرر"
                value={newPart.damage_type}
                onChange={(e) => setNewPart({ ...newPart, damage_type: e.target.value })}
                className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 text-right"
              />
              <select
                value={newPart.severity_label}
                onChange={(e) =>
                  setNewPart({ ...newPart, severity_label: e.target.value as any })
                }
                className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 text-right"
              >
                <option value="Repair">إصلاح</option>
                <option value="Replace">استبدال</option>
              </select>
              <input
                type="number"
                placeholder="السعر"
                value={newPart.price}
                onChange={(e) => setNewPart({ ...newPart, price: parseFloat(e.target.value) || 0 })}
                className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 text-right"
              />
            </div>
            <button
              onClick={addPart}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors"
            >
              ➕ إضافة الجزء
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleConfirm}
              disabled={confirming || parts.length === 0}
              className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-lg font-bold text-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {confirming ? '⏳ جاري...' : '✅ تأكيد التقدير'}
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

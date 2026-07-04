import { useState, useEffect } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
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
  const { t, lang } = useLanguage()
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
    // Load from sessionStorage if "new" estimate
    if (estimateId === 'new') {
      const analysisResult = sessionStorage.getItem('analysisResult')
      if (analysisResult) {
        const analysis = JSON.parse(analysisResult)
        setParts(analysis.damages || [])
        sessionStorage.removeItem('analysisResult')
      }
    } else {
      // Load existing estimate from API
      loadEstimate()
    }
  }, [estimateId])

  const loadEstimate = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login')
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`/api/estimates/${estimateId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) throw new Error('Failed to load estimate')

      const data = await response.json()
      setParts(data.estimate.parts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load estimate')
    } finally {
      setLoading(false)
    }
  }

  const updatePart = (index: number, field: keyof Part, value: any) => {
    const updated = [...parts]
    updated[index] = { ...updated[index], [field]: value }
    setParts(updated)
  }

  const removePart = (index: number) => {
    setParts(parts.filter((_, i) => i !== index))
  }

  const addPart = () => {
    if (!newPart.part_name_en.trim()) {
      setError('Part name required')
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
  }

  const handleConfirm = async () => {
    if (parts.length === 0) {
      setError('At least one part required')
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
        // Create new estimate
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

        if (!response.ok) throw new Error('Failed to create estimate')

        const data = await response.json()
        navigate(`/estimate/${data.estimate_id}`)
      } else {
        // Confirm existing estimate
        const response = await fetch(`/api/estimates/${estimateId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) throw new Error('Failed to confirm estimate')

        navigate('/dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div className={`min-h-screen p-8 ${lang === 'ar' ? 'rtl' : 'ltr'}`}>
        <p className="text-center text-gfast-g500">{t('loading')}</p>
      </div>
    )
  }

  const totalPrice = parts.reduce((sum, p) => sum + (p.price || 0), 0)

  return (
    <div className={`min-h-screen p-8 bg-gfast-g50 ${lang === 'ar' ? 'rtl' : 'ltr'}`}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gfast-blue hover:underline mb-4"
          >
            ← {t('dashboard')}
          </button>
          <h1 className="text-3xl font-bold">{t('estimate')}</h1>
        </div>

        <div className="bg-white rounded-2lg shadow-lg p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* Parts Table */}
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">{t('parts')}</h2>
            {parts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gfast-g200">
                      <th className="text-left py-3 px-4 font-semibold text-gfast-g700">
                        {lang === 'ar' ? 'الجزء' : 'Part'}
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gfast-g700">
                        {t('damageType')}
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gfast-g700">
                        {t('severity')}
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gfast-g700">
                        {t('price')}
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-gfast-g700">
                        {t('delete')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((part, idx) => (
                      <tr key={idx} className="border-b border-gfast-g100 hover:bg-gfast-g50">
                        <td className="py-3 px-4">
                          <div className="font-medium">
                            {lang === 'ar' ? part.part_name_ar : part.part_name_en}
                          </div>
                          {part.confidence && (
                            <div className="text-sm text-gfast-g500">
                              {Math.round(part.confidence * 100)}% confident
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={part.damage_type}
                            onChange={(e) => updatePart(idx, 'damage_type', e.target.value)}
                            className="w-full px-2 py-1 border border-gfast-g300 rounded"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={part.severity_label}
                            onChange={(e) =>
                              updatePart(idx, 'severity_label', e.target.value as any)
                            }
                            className="w-full px-2 py-1 border border-gfast-g300 rounded"
                          >
                            <option value="Repair">{t('repair')}</option>
                            <option value="Replace">{t('replace')}</option>
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            value={part.price}
                            onChange={(e) =>
                              updatePart(idx, 'price', parseFloat(e.target.value) || 0)
                            }
                            className="w-full px-2 py-1 border border-gfast-g300 rounded"
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => removePart(idx)}
                            className="text-gfast-red hover:font-bold"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-gfast-g500 py-8">
                {t('loading')}...
              </div>
            )}

            {/* Total */}
            <div className="mt-6 p-4 bg-gfast-g50 rounded-lg flex justify-between items-center">
              <span className="text-lg font-semibold">{t('total')}:</span>
              <span className="text-2xl font-bold text-gfast-blue">
                {totalPrice.toLocaleString()} {lang === 'ar' ? 'جنيه' : 'EGP'}
              </span>
            </div>
          </div>

          {/* Add New Part */}
          <div className="mb-8 p-6 bg-gfast-g50 rounded-lg">
            <h3 className="text-lg font-bold mb-4">{t('addPart')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <input
                type="text"
                placeholder={t('carBrand')}
                value={newPart.part_name_en}
                onChange={(e) => setNewPart({ ...newPart, part_name_en: e.target.value })}
                className="px-4 py-2 border border-gfast-g300 rounded-lg focus:outline-none focus:border-gfast-blue"
              />
              <input
                type="text"
                placeholder="Part (Arabic)"
                value={newPart.part_name_ar}
                onChange={(e) => setNewPart({ ...newPart, part_name_ar: e.target.value })}
                className="px-4 py-2 border border-gfast-g300 rounded-lg focus:outline-none focus:border-gfast-blue"
              />
              <input
                type="text"
                placeholder={t('damageType')}
                value={newPart.damage_type}
                onChange={(e) => setNewPart({ ...newPart, damage_type: e.target.value })}
                className="px-4 py-2 border border-gfast-g300 rounded-lg focus:outline-none focus:border-gfast-blue"
              />
              <input
                type="number"
                placeholder={t('price')}
                value={newPart.price}
                onChange={(e) => setNewPart({ ...newPart, price: parseFloat(e.target.value) || 0 })}
                className="px-4 py-2 border border-gfast-g300 rounded-lg focus:outline-none focus:border-gfast-blue"
              />
            </div>
            <button
              onClick={addPart}
              className="w-full px-4 py-2 bg-gfast-blue text-white rounded-lg font-semibold hover:bg-gfast-blue-dark"
            >
              + {t('addPart')}
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleConfirm}
              disabled={confirming || parts.length === 0}
              className="flex-1 px-6 py-3 bg-gfast-blue text-white rounded-lg font-semibold hover:bg-gfast-blue-dark disabled:bg-gfast-g400 transition-colors"
            >
              {confirming ? t('loading') : t('confirmEstimate')}
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

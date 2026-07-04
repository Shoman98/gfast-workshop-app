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
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>تحرير التقدير</h1>
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
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          padding: '2rem',
        }}>
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

          {/* Parts Table */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#111827' }}>قائمة الأجزاء</h2>

            {parts.length > 0 ? (
              <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                <table style={{ width: '100%', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #d1d5db', backgroundColor: '#f9fafb' }}>
                      <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151' }}>الجزء</th>
                      <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151' }}>نوع الضرر</th>
                      <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151' }}>الحالة</th>
                      <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151' }}>السعر</th>
                      <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151', textAlign: 'center' }}>حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((part, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <div style={{ fontWeight: '600', color: '#111827' }}>{part.part_name_ar}</div>
                          {part.confidence && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                              {Math.round(part.confidence * 100)}% ثقة
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <input
                            type="text"
                            value={part.damage_type}
                            onChange={(e) => updatePart(idx, 'damage_type', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              textAlign: 'right',
                              outline: 'none',
                            }}
                          />
                        </td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <select
                            value={part.severity_label}
                            onChange={(e) =>
                              updatePart(idx, 'severity_label', e.target.value as any)
                            }
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              textAlign: 'right',
                              outline: 'none',
                            }}
                          >
                            <option value="Repair">إصلاح</option>
                            <option value="Replace">استبدال</option>
                          </select>
                        </td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <input
                            type="number"
                            value={part.price}
                            onChange={(e) =>
                              updatePart(idx, 'price', parseFloat(e.target.value) || 0)
                            }
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              textAlign: 'right',
                              outline: 'none',
                            }}
                          />
                        </td>
                        <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                          <button
                            onClick={() => removePart(idx)}
                            style={{
                              color: '#dc2626',
                              fontWeight: 'bold',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                            }}
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
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                لا توجد أجزاء بعد
              </div>
            )}

            {/* Total */}
            <div style={{
              padding: '1.5rem',
              backgroundColor: '#eff6ff',
              borderRight: '4px solid #2563eb',
              borderRadius: '0.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#374151' }}>الإجمالي:</span>
              <span style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#2563eb' }}>
                {totalPrice.toLocaleString()} ج.م
              </span>
            </div>
          </div>

          {/* Add New Part */}
          <div style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
            border: '2px solid #e5e7eb',
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#111827' }}>إضافة جزء جديد</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="الجزء (عربي)"
                value={newPart.part_name_ar}
                onChange={(e) => setNewPart({ ...newPart, part_name_ar: e.target.value })}
                style={{
                  padding: '0.75rem 1rem',
                  border: '2px solid #d1d5db',
                  borderRadius: '0.5rem',
                  textAlign: 'right',
                  outline: 'none',
                }}
              />
              <input
                type="text"
                placeholder="نوع الضرر"
                value={newPart.damage_type}
                onChange={(e) => setNewPart({ ...newPart, damage_type: e.target.value })}
                style={{
                  padding: '0.75rem 1rem',
                  border: '2px solid #d1d5db',
                  borderRadius: '0.5rem',
                  textAlign: 'right',
                  outline: 'none',
                }}
              />
              <select
                value={newPart.severity_label}
                onChange={(e) =>
                  setNewPart({ ...newPart, severity_label: e.target.value as any })
                }
                style={{
                  padding: '0.75rem 1rem',
                  border: '2px solid #d1d5db',
                  borderRadius: '0.5rem',
                  textAlign: 'right',
                  outline: 'none',
                }}
              >
                <option value="Repair">إصلاح</option>
                <option value="Replace">استبدال</option>
              </select>
              <input
                type="number"
                placeholder="السعر"
                value={newPart.price}
                onChange={(e) => setNewPart({ ...newPart, price: parseFloat(e.target.value) || 0 })}
                style={{
                  padding: '0.75rem 1rem',
                  border: '2px solid #d1d5db',
                  borderRadius: '0.5rem',
                  textAlign: 'right',
                  outline: 'none',
                }}
              />
            </div>
            <button
              onClick={addPart}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                backgroundColor: '#16a34a',
                color: 'white',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ➕ إضافة الجزء
            </button>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleConfirm}
              disabled={confirming || parts.length === 0}
              style={{
                flex: 1,
                padding: '1rem 1.5rem',
                backgroundColor: confirming || parts.length === 0 ? '#9ca3af' : '#2563eb',
                color: 'white',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                fontSize: '1.125rem',
                border: 'none',
                cursor: confirming || parts.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {confirming ? '⏳ جاري...' : '✅ تأكيد التقدير'}
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

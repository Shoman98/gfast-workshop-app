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

interface AuditLog {
  id: string
  action_type: string
  action_description_ar: string
  timestamp: string
  field?: string
  old_value?: string
  new_value?: string
}

interface Labor {
  id?: string
  labor_name_ar: string
  price: number
}

export default function EstimatePage() {
  const { estimateId } = useParams()
  const navigate = useNavigate()
  const [parts, setParts] = useState<Part[]>([])
  const [needsCheckParts, setNeedsCheckParts] = useState<Part[]>([])
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
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const fixedLabors = [
    { id: '1', labor_name_ar: 'اعمال ميكانيكا', price: 0 },
    { id: '2', labor_name_ar: 'اعمال سمكره', price: 0 },
    { id: '3', labor_name_ar: 'اعمال دهان', price: 0 },
    { id: '4', labor_name_ar: 'اعمال ايرباج و تابلوه', price: 0 },
    { id: '5', labor_name_ar: 'اعمال فك و تركيب', price: 0 },
  ]
  const [labors, setLabors] = useState<Labor[]>(fixedLabors)
  const [estimateStatus, setEstimateStatus] = useState<'draft' | 'confirmed'>('draft')
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [vehicleInfo, setVehicleInfo] = useState({ year: 0, make: '', model: '' })
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  useEffect(() => {
    if (estimateId === 'new') {
      const analysisResult = sessionStorage.getItem('analysisResult')
      const vehicleData = sessionStorage.getItem('vehicleInfo')
      if (analysisResult) {
        const analysis = JSON.parse(analysisResult)
        console.log('📋 Estimate page loaded analysis:', {
          damages: analysis.damages?.length || 0,
          needs_check: analysis.needs_check_parts?.length || 0
        });
        setParts(analysis.damages || [])
        setNeedsCheckParts(analysis.needs_check_parts || [])
        sessionStorage.removeItem('analysisResult')
      }
      if (vehicleData) {
        const vehicle = JSON.parse(vehicleData)
        setVehicleInfo(vehicle)
        sessionStorage.removeItem('vehicleInfo')
      }
    } else if (estimateId) {
      // Load existing audit logs for this estimate
      const loadAuditLogs = async () => {
        try {
          const token = localStorage.getItem('token')
          const response = await fetch(`/api/estimates/${estimateId}/audit-logs`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (response.ok) {
            const data = await response.json()
            setAuditLogs(data.logs || [])
          }
        } catch (err) {
          console.error('Failed to load audit logs:', err)
        }
      }
      loadAuditLogs()
    }
  }, [estimateId])

  const logAudit = async (action_type: string, action_description_ar: string, field?: string, old_value?: string, new_value?: string) => {
    if (!estimateId || estimateId === 'new') return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/estimates/${estimateId}/audit-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action_type,
          action_description_ar,
          field: field || null,
          old_value: old_value || null,
          new_value: new_value || null,
        }),
      })

      if (response.ok) {
        const log = await response.json()
        const newLog: AuditLog = {
          id: log.logId,
          action_type,
          action_description_ar,
          timestamp: log.timestamp,
          field,
          old_value,
          new_value,
        }
        setAuditLogs([...auditLogs, newLog])
      }
    } catch (err) {
      console.error('Failed to log audit:', err)
    }
  }

  const updatePart = (index: number, field: keyof Part, value: any) => {
    if (estimateStatus === 'confirmed') return

    const part = parts[index]
    const oldValue = String(part[field] || '')
    const newValue = String(value || '')

    if (oldValue === newValue) return

    const updated = [...parts]
    updated[index] = { ...updated[index], [field]: value }
    setParts(updated)

    if (field === 'price') {
      logAudit('edit_part', `تم تغيير السعر من ${oldValue || '0'} إلى ${newValue} لقطعة ${part.part_name_ar}`, 'price', oldValue, newValue)
    } else if (field === 'severity_label') {
      logAudit('toggle_severity', `تم تغيير نوع الإصلاح من ${oldValue} إلى ${newValue} لقطعة ${part.part_name_ar}`, 'severity_label', oldValue, newValue)
    }
  }

  const removePart = (index: number) => {
    if (estimateStatus === 'confirmed') return

    const part = parts[index]
    setParts(parts.filter((_, i) => i !== index))
    logAudit('remove_part', `تم حذف القطعة: ${part.part_name_ar}`, undefined, JSON.stringify(part))
  }

  const approveNeedsCheckPart = (index: number) => {
    if (estimateStatus === 'confirmed') return

    const part = needsCheckParts[index]
    setParts([...parts, part])
    setNeedsCheckParts(needsCheckParts.filter((_, i) => i !== index))
    logAudit('approve_needs_check', `تمت الموافقة على القطعة المحتاجة للفحص: ${part.part_name_ar}`, undefined, undefined, JSON.stringify(part))
  }

  const rejectNeedsCheckPart = (index: number) => {
    if (estimateStatus === 'confirmed') return

    const part = needsCheckParts[index]
    setNeedsCheckParts(needsCheckParts.filter((_, i) => i !== index))
    logAudit('reject_needs_check', `تم رفض القطعة المحتاجة للفحص: ${part.part_name_ar}`, undefined, JSON.stringify(part))
  }

  const addLabor = () => {
    if (estimateStatus === 'confirmed') return
    if (!newLabor.labor_name_ar.trim()) {
      setError('يرجى إدخال اسم العمل')
      return
    }
    if (newLabor.price <= 0) {
      setError('يرجى إدخال سعر صحيح')
      return
    }
    const labor = { ...newLabor, id: Date.now().toString() }
    setLabors([...labors, labor])
    logAudit('add_labor', `تم إضافة عمل جديد: ${newLabor.labor_name_ar} (السعر: ${newLabor.price})`)
    setNewLabor({ labor_name_ar: '', price: 0 })
    setError('')
  }

  const removeLabor = (index: number) => {
    if (estimateStatus === 'confirmed') return

    const labor = labors[index]
    setLabors(labors.filter((_, i) => i !== index))
    logAudit('remove_labor', `تم حذف العمل: ${labor.labor_name_ar}`)
  }

  const updateLabor = (index: number, field: keyof Labor, value: any) => {
    if (estimateStatus === 'confirmed') return
    const labor = labors[index]
    const oldValue = String(labor[field] || '')
    const newValue = String(value || '')

    if (oldValue === newValue) return

    const updated = [...labors]
    updated[index] = { ...updated[index], [field]: value }
    setLabors(updated)

    if (field === 'price') {
      logAudit('edit_labor', `تم تغيير السعر من ${oldValue || '0'} إلى ${newValue} للعمل ${labor.labor_name_ar}`, 'price', oldValue, newValue)
    }
  }

  const addPart = () => {
    if (estimateStatus === 'confirmed') return

    if (!newPart.part_name_ar.trim()) {
      setError('يرجى إدخال اسم الجزء')
      return
    }
    setParts([...parts, { ...newPart }])
    logAudit('add_part', `تم إضافة قطعة جديدة: ${newPart.part_name_ar} (السعر: ${newPart.price})`, undefined, undefined, JSON.stringify(newPart))
    setNewPart({
      part_name_en: '',
      part_name_ar: '',
      damage_type: 'Unknown',
      severity_label: 'Repair',
      price: 0,
    })
    setError('')
  }

  const confirmEstimate = async () => {
    if (parts.length === 0) {
      setError('يرجى إضافة جزء واحد على الأقل')
      return
    }

    setShowConfirmDialog(true)
  }

  const handleConfirmDialog = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login')
      return
    }

    try {
      setConfirming(true)
      setError('')
      setShowConfirmDialog(false)

      if (estimateId === 'new') {
        const response = await fetch('/api/estimates', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            vehicle_year: vehicleInfo.year || 2023,
            vehicle_make: vehicleInfo.make || 'Unknown',
            vehicle_model: vehicleInfo.model || 'Unknown',
            parts,
            labors,
            status: 'confirmed',
          }),
        })

        if (!response.ok) throw new Error('فشل إنشاء التقدير')

        const data = await response.json()
        setEstimateStatus('confirmed')
        setShowSuccessMessage(true)

        // Redirect to report after 2s (show success message)
        setTimeout(() => {
          navigate(`/report/${data.estimate.estimate_id || estimateId}`)
        }, 2000)
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

          {showSuccessMessage && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1.5rem',
              backgroundColor: '#dcfce7',
              borderRight: '4px solid #16a34a',
              borderRadius: '0.5rem',
              color: '#166534',
              fontWeight: '600',
              fontSize: '1rem',
              textAlign: 'center',
            }}>
              ✅ تم تأكيد التقدير بنجاح! جاري فتح التقرير...
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
                            disabled={estimateStatus === 'confirmed'}
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              textAlign: 'right',
                              outline: 'none',
                              opacity: estimateStatus === 'confirmed' ? 0.6 : 1,
                              cursor: estimateStatus === 'confirmed' ? 'not-allowed' : 'text',
                            }}
                          />
                        </td>
                        <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                          <button
                            onClick={() => removePart(idx)}
                            disabled={estimateStatus === 'confirmed'}
                            style={{
                              color: '#dc2626',
                              fontWeight: 'bold',
                              background: 'none',
                              border: 'none',
                              cursor: estimateStatus === 'confirmed' ? 'not-allowed' : 'pointer',
                              opacity: estimateStatus === 'confirmed' ? 0.5 : 1,
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

          {/* Needs Check Parts Section */}
          {needsCheckParts.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#dc2626' }}>
                ⚠️ أجزاء تحتاج فحص يدوي ({needsCheckParts.length})
              </h2>
              <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                <table style={{ width: '100%', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #fecaca', backgroundColor: '#fee2e2' }}>
                      <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#991b1b' }}>الجزء</th>
                      <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#991b1b' }}>الحالة المقترحة</th>
                      <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#991b1b' }}>الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {needsCheckParts.map((part, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #fecaca', backgroundColor: '#fef2f2' }}>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <div style={{ fontWeight: '600', color: '#991b1b' }}>{part.part_name_ar}</div>
                          <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
                            {Math.round(part.confidence * 100)}% ثقة (منخفضة)
                          </div>
                        </td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.375rem 0.75rem',
                            backgroundColor: part.severity_label === 'Repair' ? '#dbeafe' : '#fee2e2',
                            color: part.severity_label === 'Repair' ? '#1e40af' : '#991b1b',
                            borderRadius: '0.375rem',
                            fontWeight: '600',
                            fontSize: '0.875rem',
                          }}>
                            {part.severity_label === 'Repair' ? 'إصلاح' : 'استبدال'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button
                              onClick={() => approveNeedsCheckPart(idx)}
                              disabled={estimateStatus === 'confirmed'}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.375rem',
                                fontWeight: '600',
                                cursor: estimateStatus === 'confirmed' ? 'not-allowed' : 'pointer',
                                opacity: estimateStatus === 'confirmed' ? 0.5 : 1,
                              }}
                              title="إضافة إلى الأجزاء المؤكدة"
                            >
                              ✅ موافق
                            </button>
                            <button
                              onClick={() => rejectNeedsCheckPart(idx)}
                              disabled={estimateStatus === 'confirmed'}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: '#6b7280',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.375rem',
                                fontWeight: '600',
                                cursor: estimateStatus === 'confirmed' ? 'not-allowed' : 'pointer',
                                opacity: estimateStatus === 'confirmed' ? 0.5 : 1,
                              }}
                              title="رفض هذا الجزء"
                            >
                              ❌ رفض
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
              disabled={estimateStatus === 'confirmed'}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                backgroundColor: estimateStatus === 'confirmed' ? '#9ca3af' : '#16a34a',
                color: 'white',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                border: 'none',
                cursor: estimateStatus === 'confirmed' ? 'not-allowed' : 'pointer',
              }}
            >
              ➕ إضافة الجزء
            </button>
          </div>

          {/* Fixed Labor Section - 5 Labor Types */}
          <div style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            backgroundColor: '#fef3c7',
            borderRadius: '0.5rem',
            border: '2px solid #f59e0b',
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#92400e' }}>
              الأعمال (اختياري - أضف أسعار العمل)
            </h3>

            <div style={{ marginBottom: '1.5rem' }}>
              <table style={{ width: '100%', textAlign: 'right', marginBottom: '1rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f59e0b' }}>
                    <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#92400e' }}>م</th>
                    <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#92400e' }}>وصف الأعمال</th>
                    <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#92400e', textAlign: 'center' }}>التكلفة</th>
                  </tr>
                </thead>
                <tbody>
                  {labors.map((labor, idx) => (
                    <tr key={labor.id || idx} style={{ borderBottom: '1px solid #fde68a' }}>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '0.75rem' }}>{labor.labor_name_ar}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <input
                          type="number"
                          value={labor.price || 0}
                          onChange={(e) => updateLabor(idx, 'price', parseFloat(e.target.value) || 0)}
                          disabled={estimateStatus === 'confirmed'}
                          placeholder="0"
                          min="0"
                          style={{
                            width: '120px',
                            padding: '0.5rem',
                            border: '1px solid #f59e0b',
                            borderRadius: '0.375rem',
                            textAlign: 'center',
                            opacity: estimateStatus === 'confirmed' ? 0.6 : 1,
                            cursor: estimateStatus === 'confirmed' ? 'not-allowed' : 'text',
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{
                padding: '0.75rem',
                backgroundColor: '#fef3c7',
                borderRadius: '0.375rem',
                fontSize: '0.95rem',
                fontWeight: 'bold',
                color: '#92400e',
                textAlign: 'right',
                borderTop: '2px solid #f59e0b',
              }}>
                إجمالي تكلفة الأعمال: {labors.reduce((sum, l) => sum + (l.price || 0), 0).toLocaleString()} ج.م
              </div>
            </div>
          </div>

          {/* Activity Log */}
          <div style={{
            marginTop: '2rem',
            padding: '1.5rem',
            backgroundColor: '#f3f4f6',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem', color: '#111827' }}>سجل الأنشطة</h3>
            {auditLogs.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>لم تقم بأي تعديلات بعد</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto' }}>
                {auditLogs.map((log) => (
                  <div key={log.id} style={{
                    padding: '0.75rem',
                    backgroundColor: 'white',
                    borderRadius: '0.375rem',
                    borderRight: '3px solid #2563eb',
                  }}>
                    <p style={{ margin: '0 0 0.25rem 0', color: '#111827', fontSize: '0.875rem', fontWeight: '500' }}>
                      {log.action_description_ar}
                    </p>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '0.75rem' }}>
                      {new Date(log.timestamp).toLocaleTimeString('ar-EG')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={confirmEstimate}
              disabled={confirming || parts.length === 0 || estimateStatus === 'confirmed'}
              style={{
                flex: 1,
                padding: '1rem 1.5rem',
                backgroundColor: confirming || parts.length === 0 || estimateStatus === 'confirmed' ? '#9ca3af' : '#2563eb',
                color: 'white',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                fontSize: '1.125rem',
                border: 'none',
                cursor: confirming || parts.length === 0 || estimateStatus === 'confirmed' ? 'not-allowed' : 'pointer',
              }}
            >
              {estimateStatus === 'confirmed' ? '✅ مؤكد' : confirming ? '⏳ جاري...' : '✅ تأكيد التقدير'}
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

          {/* Confirmation Dialog */}
          {showConfirmDialog && (
            <div style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
            }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '0.75rem',
                padding: '2rem',
                maxWidth: '400px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#111827' }}>
                  تأكيد التقدير
                </h3>
                <p style={{ color: '#6b7280', marginBottom: '2rem', lineHeight: 1.6 }}>
                  بعد التأكيد لن تتمكن من تعديل أي بيانات
                </p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={handleConfirmDialog}
                    disabled={confirming}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      backgroundColor: confirming ? '#9ca3af' : '#2563eb',
                      color: 'white',
                      borderRadius: '0.5rem',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: confirming ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {confirming ? '⏳ جاري...' : 'تأكيد'}
                  </button>
                  <button
                    onClick={() => setShowConfirmDialog(false)}
                    disabled={confirming}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      backgroundColor: 'white',
                      color: '#6b7280',
                      border: '2px solid #d1d5db',
                      borderRadius: '0.5rem',
                      fontWeight: 'bold',
                      cursor: confirming ? 'not-allowed' : 'pointer',
                    }}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

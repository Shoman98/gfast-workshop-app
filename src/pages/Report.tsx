import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

interface ReportData {
  estimate_id: string
  workshop_id: string
  vehicle_year: number
  vehicle_make: string
  vehicle_model: string
  confirmed_at: string
  parts: any[]
  estimate_parts?: any[]
  estimate_labors?: any[]
  labors: any[]
  workshop: {
    workshop_name: string
    city: string
    phone: string
  }
}

export default function ReportPage() {
  const { estimateId } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadReport()
  }, [estimateId])

  const loadReport = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')

      console.log('📄 Report: Loading estimate', estimateId)
      const response = await fetch(apiUrl(`/api/estimates/${estimateId}`), {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) throw new Error('فشل تحميل التقرير')

      const data = await response.json()
      console.log('📄 Report: API response:', {
        success: data.success,
        hasEstimate: !!data.estimate,
        estimateId: data.estimate?.estimate_id,
        vehicleInfo: {
          year: data.estimate?.vehicle_year,
          make: data.estimate?.vehicle_make,
          model: data.estimate?.vehicle_model,
        },
        estimatePartsLength: data.estimate?.estimate_parts?.length || 0,
        estimatePartsSample: data.estimate?.estimate_parts?.slice(0, 2),
        laborsLength: data.estimate?.labors?.length || 0,
      })

      const workshopData = JSON.parse(localStorage.getItem('workshop') || '{}')

      setReport({
        ...data.estimate,
        workshop: {
          workshop_name: workshopData.workshop_name || 'ورشة',
          city: workshopData.city || '-',
          phone: workshopData.phone || '-',
        },
      })

      setShareUrl(`${window.location.origin}/report/${estimateId}?public=true`)
    } catch (err) {
      console.error('📄 Report: Error loading:', err)
      setError(err instanceof Error ? err.message : 'خطأ في تحميل التقرير')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const allParts = report?.estimate_parts || report?.parts || []
  const replaceParts = allParts.filter((p) => p.severity_label === 'Replace')
  const repairParts = allParts.filter((p) => p.severity_label === 'Repair')
  const laborCosts = report?.estimate_labors?.filter((l) => (l.price || 0) > 0) || report?.labors?.filter((l) => (l.price || 0) > 0) || []

  if (report) {
    console.log('📄 Report Data:', {
      hasEstimateParts: !!report.estimate_parts,
      hasParts: !!report.parts,
      estimatePartsLength: report.estimate_parts?.length || 0,
      partsLength: report.parts?.length || 0,
      replacePartsLength: replaceParts.length,
      replaceParts: replaceParts.map(p => ({ name_ar: p.part_name_ar, severity: p.severity_label, price: p.price })),
      laborCostsLength: laborCosts.length,
    })
  }

  const totalPartsCost = replaceParts.reduce((sum, p) => sum + (p.price || 0), 0)
  const totalRepairLaborCost = repairParts.reduce((sum, p) => sum + (p.price || 0), 0)
  const totalLaborCost = laborCosts.reduce((sum, l) => sum + (l.price || 0), 0) + totalRepairLaborCost
  const totalCost = totalPartsCost + totalLaborCost

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  const chunkParts = (parts: any[]) => {
    const chunkSize = 10
    const chunks = []
    for (let i = 0; i < parts.length; i += chunkSize) {
      chunks.push(parts.slice(i, i + chunkSize))
    }
    return chunks
  }

  const partColumns = chunkParts(replaceParts)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', direction: 'rtl' }}>
        <p style={{ color: '#4b5563' }}>⏳ جاري تحميل التقرير...</p>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', direction: 'rtl' }}>
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '0.75rem', textAlign: 'center', maxWidth: '400px' }}>
          <p style={{ color: '#991b1b', marginBottom: '1rem' }}>❌ {error}</p>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#2563eb',
              color: 'white',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            ← العودة للتقديرات
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', padding: '2rem 1rem', direction: 'rtl' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Report Container - Excel Layout */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          padding: '2.5rem',
        }}>
          {/* Header - مقايسة إصلاح */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem', borderBottom: '3px solid #1e3a8a', paddingBottom: '1rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0 0 1rem 0', color: '#1e3a8a' }}>
              مقايسة إصلاح
            </h1>
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#6b7280' }}>
              التاريخ : {formatDate(report.confirmed_at)}
            </p>
          </div>

          {/* Workshop & Vehicle Info - 2 Columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2.5rem', fontSize: '0.9rem' }}>
            {/* Left Column - Workshop Info */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e5e7eb' }}>
                <p style={{ color: '#6b7280', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>اسم الورشه</p>
                <p style={{ color: '#111827', margin: 0, fontWeight: '600' }}>{report.workshop.workshop_name}</p>
              </div>
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e5e7eb' }}>
                <p style={{ color: '#6b7280', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>العنوان</p>
                <p style={{ color: '#111827', margin: 0, fontWeight: '600' }}>{report.workshop.city}</p>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ color: '#6b7280', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>التليفون</p>
                <p style={{ color: '#111827', margin: 0, fontWeight: '600' }}>{report.workshop.phone}</p>
              </div>
            </div>

            {/* Right Column - Vehicle Info */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e5e7eb' }}>
                <p style={{ color: '#6b7280', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>ماركة السيارة</p>
                <p style={{ color: '#111827', margin: 0, fontWeight: '600' }}>{report.vehicle_make}</p>
              </div>
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #e5e7eb' }}>
                <p style={{ color: '#6b7280', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>الموديل</p>
                <p style={{ color: '#111827', margin: 0, fontWeight: '600' }}>{report.vehicle_model}</p>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ color: '#6b7280', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>سنه الصنع</p>
                <p style={{ color: '#111827', margin: 0, fontWeight: '600' }}>{report.vehicle_year}</p>
              </div>
            </div>
          </div>

          {/* Spare Parts - 3 Column Grid (Excel Layout) */}
          {replaceParts.length > 0 && (
            <div style={{ marginBottom: '2.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1e3a8a', marginTop: 0, marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '2px solid #1e3a8a' }}>
                قطع الغيار
              </h3>

              {/* 3-Column Parts Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', marginBottom: '1.5rem' }}>
                {partColumns.map((column, colIdx) => (
                  <div key={colIdx}>
                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #1e3a8a' }}>
                          <th style={{ padding: '0.5rem', fontWeight: 'bold', color: '#1e3a8a', textAlign: 'center', width: '30px' }}>م</th>
                          <th style={{ padding: '0.5rem', fontWeight: 'bold', color: '#1e3a8a', textAlign: 'right' }}>قطع الغيار</th>
                          <th style={{ padding: '0.5rem', fontWeight: 'bold', color: '#1e3a8a', textAlign: 'center', width: '80px' }}>السعر</th>
                        </tr>
                      </thead>
                      <tbody>
                        {column.map((part, rowIdx) => (
                          <tr key={rowIdx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '0.5rem', textAlign: 'center', color: '#6b7280' }}>{rowIdx + (colIdx * 10) + 1}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', color: '#111827' }}>{part.part_name_ar}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'center', color: '#111827', fontWeight: '600' }}>{part.price?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {/* Total Parts Cost */}
              <div style={{
                padding: '1rem',
                backgroundColor: '#f0f9ff',
                borderRight: '4px solid #1e3a8a',
                borderRadius: '0.375rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '1.5rem',
              }}>
                <span style={{ fontWeight: 'bold', color: '#1e3a8a', fontSize: '0.95rem' }}>إجمالى تكلفة قطع الغيار</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#1e3a8a' }}>
                  {totalPartsCost.toLocaleString()} ج.م
                </span>
              </div>
            </div>
          )}

          {/* Labor/Works Section - الأعمال */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1e3a8a', marginTop: 0, marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '2px solid #1e3a8a' }}>
              وصف الأعمال
            </h3>

            {(laborCosts.length > 0 || repairParts.length > 0) ? (
              <>
                <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse', marginBottom: '1rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #1e3a8a' }}>
                      <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#1e3a8a', textAlign: 'center', width: '40px' }}>م</th>
                      <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#1e3a8a', textAlign: 'right' }}>وصف الأعمال</th>
                      <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#1e3a8a', textAlign: 'center', width: '100px' }}>التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laborCosts.map((labor, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: '#6b7280' }}>{idx + 1}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#111827' }}>{labor.labor_name_ar}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: '#111827', fontWeight: '600' }}>
                          {labor.price?.toLocaleString()} ج.م
                        </td>
                      </tr>
                    ))}
                    {repairParts.length > 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: '0.5rem 0.75rem', backgroundColor: '#f3f4f6', fontWeight: 'bold', color: '#1e3a8a', fontSize: '0.85rem', borderTop: '2px solid #1e3a8a' }}>
                          أعمال إصلاح القطع
                        </td>
                      </tr>
                    )}
                    {repairParts.map((part, idx) => (
                      <tr key={`repair-${idx}`} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: '#6b7280' }}>{laborCosts.length + idx + 1}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#111827' }}>{part.part_name_ar}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: '#111827', fontWeight: '600' }}>
                          {(part.price || 0).toLocaleString()} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Total Labor Cost */}
                <div style={{
                  padding: '1rem',
                  backgroundColor: '#fef3c7',
                  borderRight: '4px solid #f59e0b',
                  borderRadius: '0.375rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 'bold', color: '#92400e', fontSize: '0.95rem' }}>إجمالى تكلفة الأعمال</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#92400e' }}>
                    {totalLaborCost.toLocaleString()} ج.م
                  </span>
                </div>
              </>
            ) : (
              <p style={{ color: '#6b7280', fontSize: '0.9rem', textAlign: 'center', margin: '1rem 0' }}>لم يتم إضافة أي أعمال</p>
            )}
          </div>

          {/* Grand Total - إجمالى التكلفة */}
          <div style={{
            padding: '1.5rem',
            backgroundColor: '#dcfce7',
            borderRight: '4px solid #16a34a',
            borderRadius: '0.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
          }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#166534' }}>إجمالى التكلفة</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#16a34a' }}>
              {totalCost.toLocaleString()} ج.م
            </span>
          </div>

          {/* Watermark */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', letterSpacing: '0.05em' }}>
              Powered by <span style={{ fontWeight: 'bold', color: '#2563eb' }}>G-Fast</span>
            </p>
          </div>

          {/* Share Section */}
          <div style={{
            backgroundColor: '#f3f4f6',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
          }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#0f172a', marginTop: 0, marginBottom: '1rem' }}>
              شارك التقرير
            </h3>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                type="text"
                value={shareUrl}
                readOnly
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.85rem',
                  color: '#6b7280',
                  textAlign: 'right',
                }}
              />
              <button
                onClick={copyToClipboard}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: copied ? '#16a34a' : '#2563eb',
                  color: 'white',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? '✅ تم النسخ' : '📋 نسخ الرابط'}
              </button>
            </div>
          </div>

          {/* Back Button */}
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              width: '100%',
              padding: '1rem',
              backgroundColor: '#f3f4f6',
              color: '#2563eb',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            ← العودة للتقديرات
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

interface ReportData {
  estimate_id: string
  workshop_id: string
  vehicle_year: number
  vehicle_make: string
  vehicle_model: string
  confirmed_at: string
  parts: any[]
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

      const response = await fetch(`/api/estimates/${estimateId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) throw new Error('فشل تحميل التقرير')

      const data = await response.json()
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

  const replaceParts = report?.parts?.filter((p) => p.severity_label === 'Replace') || []
  const laborCosts = report?.labors || []

  const totalPartsCost = replaceParts.reduce((sum, p) => sum + (p.price || 0), 0)
  const totalLaborCost = laborCosts.reduce((sum, l) => sum + (l.price || 0), 0)
  const totalCost = totalPartsCost + totalLaborCost

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
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Report Container */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            backgroundColor: '#1e3a8a',
            color: 'white',
            padding: '2rem',
            textAlign: 'center',
          }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0, marginBottom: '0.5rem' }}>
              مقايسة إصلاح سيارة
            </h1>
            <p style={{ margin: 0, opacity: 0.9, fontSize: '0.95rem' }}>
              Repair Estimate Report
            </p>
          </div>

          {/* Main Content */}
          <div style={{ padding: '2rem' }}>
            {/* Workshop Info Section */}
            <div style={{
              backgroundColor: '#f3f4f6',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              marginBottom: '2rem',
              borderRight: '4px solid #1e3a8a',
            }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#0f172a', marginTop: 0, marginBottom: '1rem' }}>
                بيانات الورشة
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
                <div>
                  <p style={{ color: '#6b7280', margin: '0 0 0.25rem 0' }}>اسم الورشة</p>
                  <p style={{ color: '#0f172a', fontWeight: '600', margin: 0 }}>{report.workshop.workshop_name}</p>
                </div>
                <div>
                  <p style={{ color: '#6b7280', margin: '0 0 0.25rem 0' }}>التليفون</p>
                  <p style={{ color: '#0f172a', fontWeight: '600', margin: 0 }}>{report.workshop.phone}</p>
                </div>
                <div>
                  <p style={{ color: '#6b7280', margin: '0 0 0.25rem 0' }}>العنوان</p>
                  <p style={{ color: '#0f172a', fontWeight: '600', margin: 0 }}>{report.workshop.city}</p>
                </div>
                <div>
                  <p style={{ color: '#6b7280', margin: '0 0 0.25rem 0' }}>التاريخ</p>
                  <p style={{ color: '#0f172a', fontWeight: '600', margin: 0 }}>
                    {new Date(report.confirmed_at).toLocaleDateString('ar-EG')}
                  </p>
                </div>
              </div>
            </div>

            {/* Vehicle Info Section */}
            <div style={{
              backgroundColor: '#f3f4f6',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              marginBottom: '2rem',
              borderRight: '4px solid #1e3a8a',
            }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#0f172a', marginTop: 0, marginBottom: '1rem' }}>
                بيانات المركبة
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
                <div>
                  <p style={{ color: '#6b7280', margin: '0 0 0.25rem 0' }}>الماركة</p>
                  <p style={{ color: '#0f172a', fontWeight: '600', margin: 0 }}>{report.vehicle_make}</p>
                </div>
                <div>
                  <p style={{ color: '#6b7280', margin: '0 0 0.25rem 0' }}>الموديل</p>
                  <p style={{ color: '#0f172a', fontWeight: '600', margin: 0 }}>{report.vehicle_model}</p>
                </div>
                <div>
                  <p style={{ color: '#6b7280', margin: '0 0 0.25rem 0' }}>السنة</p>
                  <p style={{ color: '#0f172a', fontWeight: '600', margin: 0 }}>{report.vehicle_year}</p>
                </div>
              </div>
            </div>

            {/* Parts Section */}
            {replaceParts.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{
                  fontSize: '1.125rem',
                  fontWeight: 'bold',
                  color: '#0f172a',
                  paddingBottom: '0.75rem',
                  borderBottom: '3px solid #1e3a8a',
                  marginBottom: '1rem',
                }}>
                  قطع الغيار
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', textAlign: 'right', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #d1d5db' }}>
                        <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#0f172a', textAlign: 'right' }}>اسم القطعة</th>
                        <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#0f172a', textAlign: 'center' }}>السعر</th>
                      </tr>
                    </thead>
                    <tbody>
                      {replaceParts.map((part, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem', color: '#111827' }}>{part.part_name_ar}</td>
                          <td style={{ padding: '0.75rem', color: '#111827', textAlign: 'center', fontWeight: '600' }}>
                            {part.price?.toLocaleString()} ج.م
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  backgroundColor: '#dbeafe',
                  borderRight: '4px solid #0284c7',
                  borderRadius: '0.375rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 'bold', color: '#0c4a6e' }}>إجمالى تكلفة قطع الغيار</span>
                  <span style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#0c4a6e' }}>
                    {totalPartsCost.toLocaleString()} ج.م
                  </span>
                </div>
              </div>
            )}

            {/* Labor Section */}
            {laborCosts.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{
                  fontSize: '1.125rem',
                  fontWeight: 'bold',
                  color: '#0f172a',
                  paddingBottom: '0.75rem',
                  borderBottom: '3px solid #1e3a8a',
                  marginBottom: '1rem',
                }}>
                  وصف الأعمال
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', textAlign: 'right', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #d1d5db' }}>
                        <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#0f172a', textAlign: 'right' }}>اسم العمل</th>
                        <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#0f172a', textAlign: 'center' }}>التكلفة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laborCosts.map((labor, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem', color: '#111827' }}>{labor.labor_name_ar}</td>
                          <td style={{ padding: '0.75rem', color: '#111827', textAlign: 'center', fontWeight: '600' }}>
                            {labor.price?.toLocaleString()} ج.م
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  backgroundColor: '#fef3c7',
                  borderRight: '4px solid #ca8a04',
                  borderRadius: '0.375rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 'bold', color: '#92400e' }}>إجمالى تكلفة الأعمال</span>
                  <span style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#92400e' }}>
                    {totalLaborCost.toLocaleString()} ج.م
                  </span>
                </div>
              </div>
            )}

            {/* Total Cost */}
            <div style={{
              padding: '1.5rem',
              backgroundColor: '#dcfce7',
              borderRight: '4px solid #16a34a',
              borderRadius: '0.5rem',
              marginBottom: '2rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#166534' }}>إجمالى التكلفة</span>
              <span style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#16a34a' }}>
                {totalCost.toLocaleString()} ج.م
              </span>
            </div>

            {/* Share Section */}
            <div style={{
              backgroundColor: '#f3f4f6',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              marginBottom: '2rem',
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

            {/* Actions */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => window.print()}
                style={{
                  flex: 1,
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#1e40af',
                  color: 'white',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                🖨️ طباعة
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  flex: 1,
                  padding: '0.75rem 1.5rem',
                  border: '2px solid #d1d5db',
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                ← العودة للتقديرات
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

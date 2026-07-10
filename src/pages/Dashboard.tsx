import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface Estimate {
  estimate_id: string
  vehicle_year: number
  vehicle_make: string
  vehicle_model: string
  status: 'draft' | 'confirmed' | 'exported'
  total_cost_min?: number
  total_cost_max?: number
  created_at: string
  parts: any[]
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workshop, setWorkshop] = useState<any>(null)
  const [searchBrand, setSearchBrand] = useState('')

  const filteredEstimates = estimates.filter((est) => {
    const brandMatch = est.vehicle_make.toLowerCase().includes(searchBrand.toLowerCase())
    return brandMatch
  })

  useEffect(() => {
    const workshopData = localStorage.getItem('workshop')
    if (workshopData) {
      setWorkshop(JSON.parse(workshopData))
    }
    loadEstimates()
  }, [])

  const loadEstimates = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login')
      return
    }

    try {
      setLoading(true)
      const response = await fetch('/api/estimates', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) throw new Error('فشل تحميل التقديرات')

      const data = await response.json()
      setEstimates(data.estimates || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل التقديرات')
    } finally {
      setLoading(false)
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'مسودة'
      case 'confirmed': return 'مؤكد'
      case 'exported': return 'مصدر'
      default: return status
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return { bg: '#fef3c7', text: '#92400e' }
      case 'confirmed': return { bg: '#dcfce7', text: '#166534' }
      case 'exported': return { bg: '#dbeafe', text: '#0c4a6e' }
      default: return { bg: '#f3f4f6', text: '#374151' }
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG')
  }

  const handleLogout = () => {
    localStorage.clear()
    navigate('/login')
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
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>جي-فاست</h1>
            {workshop && <p style={{ fontSize: '0.875rem', color: '#4b5563', marginTop: '0.25rem' }}>{workshop.workshop_name}</p>}
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#dc2626',
              color: 'white',
              borderRadius: '0.5rem',
              fontWeight: '500',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            🚪 خروج
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* New Estimate Button */}
        <button
          onClick={() => navigate('/analysis')}
          style={{
            marginBottom: '2rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#2563eb',
            color: 'white',
            borderRadius: '0.5rem',
            fontWeight: 'bold',
            fontSize: '1.125rem',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ➕ تقدير جديد
        </button>

        {/* Estimates Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          padding: '2rem',
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#111827' }}>
            التقديرات الأخيرة
          </h2>

          {/* Search Bar */}
          {estimates.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <input
                type="text"
                value={searchBrand}
                onChange={(e) => setSearchBrand(e.target.value)}
                placeholder="ابحث عن ماركة المركبة..."
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '2px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  textAlign: 'right',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
              />
              {searchBrand && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  عدد النتائج: {filteredEstimates.length}
                </p>
              )}
            </div>
          )}

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

          {loading ? (
            <div style={{ textAlign: 'center', paddingTop: '3rem', paddingBottom: '3rem' }}>
              <p style={{ color: '#4b5563' }}>⏳ جاري التحميل...</p>
            </div>
          ) : estimates.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '3rem', paddingBottom: '3rem' }}>
              <p style={{ color: '#4b5563', marginBottom: '1.5rem', fontSize: '1.125rem' }}>لا توجد تقديرات بعد</p>
              <button
                onClick={() => navigate('/analysis')}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ➕ إنشاء تقدير جديد
              </button>
            </div>
          ) : filteredEstimates.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '2rem', paddingBottom: '2rem' }}>
              <p style={{ color: '#4b5563', fontSize: '1rem' }}>لم يتم العثور على نتائج لـ "{searchBrand}"</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'right' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #d1d5db' }}>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151' }}>المركبة</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151' }}>الأجزاء</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151' }}>التكلفة</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151' }}>الحالة</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151' }}>التاريخ</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151', textAlign: 'center' }}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEstimates.map((estimate) => {
                    const statusColor = getStatusColor(estimate.status)
                    return (
                      <tr
                        key={estimate.estimate_id}
                        style={{
                          borderBottom: '1px solid #e5e7eb',
                          transition: 'background-color 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <div style={{ fontWeight: '600', color: '#111827' }}>
                            {estimate.vehicle_year} {estimate.vehicle_make} {estimate.vehicle_model}
                          </div>
                        </td>
                        <td style={{ padding: '1rem 1.5rem', color: '#4b5563' }}>
                          {estimate.parts?.length || 0} أجزاء
                        </td>
                        <td style={{ padding: '1rem 1.5rem', fontWeight: '600', color: '#111827' }}>
                          {estimate.total_cost_max ? `${estimate.total_cost_max.toLocaleString()} ج.م` : '—'}
                        </td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <span
                            style={{
                              padding: '0.25rem 0.75rem',
                              backgroundColor: statusColor.bg,
                              color: statusColor.text,
                              borderRadius: '0.25rem',
                              fontSize: '0.875rem',
                              fontWeight: 'bold',
                            }}
                          >
                            {getStatusLabel(estimate.status)}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 1.5rem', color: '#4b5563', fontSize: '0.875rem' }}>
                          {formatDate(estimate.created_at)}
                        </td>
                        <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            {estimate.status === 'confirmed' ? (
                              <button
                                onClick={() => navigate(`/report/${estimate.estimate_id}`)}
                                style={{
                                  padding: '0.5rem 1rem',
                                  backgroundColor: '#16a34a',
                                  color: 'white',
                                  borderRadius: '0.5rem',
                                  fontWeight: 'bold',
                                  fontSize: '0.875rem',
                                  border: 'none',
                                  cursor: 'pointer',
                                }}
                              >
                                📄 التقرير
                              </button>
                            ) : (
                              <button
                                onClick={() => navigate(`/estimate/${estimate.estimate_id}`)}
                                style={{
                                  padding: '0.5rem 1rem',
                                  backgroundColor: '#2563eb',
                                  color: 'white',
                                  borderRadius: '0.5rem',
                                  fontWeight: 'bold',
                                  fontSize: '0.875rem',
                                  border: 'none',
                                  cursor: 'pointer',
                                }}
                              >
                                ✏️ تعديل
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

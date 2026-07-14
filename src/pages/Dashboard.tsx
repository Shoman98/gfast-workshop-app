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
  const [searchQuery, setSearchQuery] = useState('')

  // Filter: only confirmed estimates, searchable by vehicle brand/model/year
  const confirmedEstimates = estimates.filter((est) => est.status === 'confirmed')

  const filteredEstimates = confirmedEstimates.filter((est) => {
    const query = searchQuery.toLowerCase()
    const make = est.vehicle_make.toLowerCase()
    const model = est.vehicle_model.toLowerCase()
    const year = est.vehicle_year.toString()
    return make.includes(query) || model.includes(query) || year.includes(query)
  })

  useEffect(() => {
    console.log('🔵 Dashboard: useEffect mounted')
    const workshopData = localStorage.getItem('workshop')
    if (workshopData) {
      setWorkshop(JSON.parse(workshopData))
    }
    loadEstimates()
  }, [navigate])

  const loadEstimates = async () => {
    console.log('📊 Dashboard: loadEstimates called')
    const token = localStorage.getItem('token')
    if (!token) {
      console.log('❌ Dashboard: No token found')
      navigate('/login')
      return
    }

    try {
      setLoading(true)
      console.log('🔄 Dashboard: Fetching /api/estimates')
      const response = await fetch('/api/estimates', {
        headers: { Authorization: `Bearer ${token}` },
      })

      console.log('📦 Dashboard: Response status:', response.status)
      if (!response.ok) throw new Error('فشل تحميل التقديرات')

      const data = await response.json()
      console.log('✅ Dashboard: Loaded estimates:', data.estimates?.length || 0, 'total')
      console.log('   Confirmed only:', data.estimates?.filter((e: any) => e.status === 'confirmed').length || 0)
      setEstimates(data.estimates || [])
    } catch (err) {
      console.error('💥 Dashboard: Error loading estimates:', err)
      setError(err instanceof Error ? err.message : 'فشل تحميل التقديرات')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG')
  }

  const handleLogout = () => {
    localStorage.clear()
    navigate('/login')
  }

  const countDamages = (parts: any[]) => {
    return parts?.filter(p => p.severity_label === 'Replace').length || 0
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
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb', margin: 0 }}>
              G-Fast
            </h1>
            {workshop && (
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem', margin: 0 }}>
                {workshop.workshop_name}
              </p>
            )}
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
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>
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

        {/* Confirmed Estimates Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          padding: '2rem',
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#111827', marginTop: 0 }}>
            التقديرات المؤكدة
          </h2>

          {/* Search Bar */}
          {confirmedEstimates.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن الماركة أو الموديل أو السنة..."
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
              {searchQuery && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', marginBottom: 0 }}>
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
              <p style={{ color: '#6b7280' }}>⏳ جاري التحميل...</p>
            </div>
          ) : confirmedEstimates.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '3rem', paddingBottom: '3rem' }}>
              <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '1.125rem' }}>
                لا توجد تقديرات مؤكدة بعد
              </p>
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
              <p style={{ color: '#6b7280', fontSize: '1rem' }}>
                لم يتم العثور على نتائج لـ "{searchQuery}"
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'right', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #d1d5db', backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151', textAlign: 'right' }}>
                      الماركة / الموديل / السنة
                    </th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151', textAlign: 'center' }}>
                      التاريخ
                    </th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 'bold', color: '#374151', textAlign: 'center' }}>
                      التقرير
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEstimates.map((estimate) => (
                    <tr
                      key={estimate.estimate_id}
                      style={{
                        borderBottom: '1px solid #e5e7eb',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {/* Vehicle Info */}
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                        <div style={{ fontWeight: '600', color: '#111827', fontSize: '0.95rem' }}>
                          {estimate.vehicle_make} {estimate.vehicle_model}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                          {estimate.vehicle_year}
                        </div>
                      </td>

                      {/* Date */}
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
                        {formatDate(estimate.created_at)}
                      </td>

                      {/* Report Hyperlink */}
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
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
                            whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#15803d'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#16a34a'}
                        >
                          📄 تقرير
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

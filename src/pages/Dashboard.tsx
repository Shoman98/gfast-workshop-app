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
      case 'draft':
        return 'مسودة'
      case 'confirmed':
        return 'مؤكد'
      case 'exported':
        return 'مصدر'
      default:
        return status
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-yellow-100 text-yellow-800'
      case 'confirmed':
        return 'bg-green-100 text-green-800'
      case 'exported':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
    <div className="min-h-screen bg-gray-50 rtl" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-blue-600">جي-فاست</h1>
            {workshop && <p className="text-sm text-gray-600 mt-1">{workshop.workshop_name}</p>}
          </div>
          <button
            onClick={handleLogout}
            className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
          >
            🚪 خروج
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* New Estimate Button */}
        <button
          onClick={() => navigate('/analysis')}
          className="mb-8 px-6 py-3 bg-blue-600 text-white rounded-lg font-bold text-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          ➕ تقدير جديد
        </button>

        {/* Estimates Section */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">التقديرات الأخيرة</h2>

          {error && (
            <div className="mb-6 p-4 bg-red-100 border-r-4 border-red-500 text-red-700 rounded-lg font-medium">
              ⚠️ {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">⏳ جاري التحميل...</p>
            </div>
          ) : estimates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-6 text-lg">لا توجد تقديرات بعد</p>
              <button
                onClick={() => navigate('/analysis')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
              >
                ➕ إنشاء تقدير جديد
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-right py-4 px-6 font-bold text-gray-700">المركبة</th>
                    <th className="text-right py-4 px-6 font-bold text-gray-700">الأجزاء</th>
                    <th className="text-right py-4 px-6 font-bold text-gray-700">التكلفة</th>
                    <th className="text-right py-4 px-6 font-bold text-gray-700">الحالة</th>
                    <th className="text-right py-4 px-6 font-bold text-gray-700">التاريخ</th>
                    <th className="text-center py-4 px-6 font-bold text-gray-700">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {estimates.map((estimate) => (
                    <tr
                      key={estimate.estimate_id}
                      className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <div className="font-semibold text-gray-900">
                          {estimate.vehicle_year} {estimate.vehicle_make} {estimate.vehicle_model}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-gray-600">
                        {estimate.parts?.length || 0} أجزاء
                      </td>
                      <td className="py-4 px-6 font-semibold text-gray-900">
                        {estimate.total_cost_max ? `${estimate.total_cost_max.toLocaleString()} ج.م` : '—'}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-bold ${getStatusColor(
                            estimate.status
                          )}`}
                        >
                          {getStatusLabel(estimate.status)}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-gray-600 text-sm">
                        {formatDate(estimate.created_at)}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => navigate(`/estimate/${estimate.estimate_id}`)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-sm transition-colors"
                        >
                          عرض
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

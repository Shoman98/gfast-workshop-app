import { useState, useEffect } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
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
  const { t, lang } = useLanguage()
  const navigate = useNavigate()
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
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

      if (!response.ok) throw new Error('Failed to load estimates')

      const data = await response.json()
      setEstimates(data.estimates || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load estimates')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gfast-g200 text-gfast-g700'
      case 'confirmed':
        return 'bg-blue-200 text-gfast-blue'
      case 'exported':
        return 'bg-green-200 text-green-700'
      default:
        return 'bg-gfast-g100 text-gfast-g700'
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')
  }

  return (
    <div className={`min-h-screen p-8 bg-gfast-g50 ${lang === 'ar' ? 'rtl' : 'ltr'}`}>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">{t('dashboard')}</h1>
          <button
            onClick={() => {
              localStorage.clear()
              navigate('/login')
            }}
            className="px-4 py-2 bg-gfast-red text-white rounded-lg hover:bg-red-700 font-semibold"
          >
            {t('logout')}
          </button>
        </div>

        <button
          onClick={() => navigate('/analysis')}
          className="mb-8 px-6 py-3 bg-gfast-blue text-white rounded-lg font-semibold hover:bg-gfast-blue-dark transition-colors"
        >
          + {t('newEstimate')}
        </button>

        <div className="bg-white rounded-2lg shadow-lg p-8">
          <h2 className="text-xl font-bold mb-6">{t('recentEstimates')}</h2>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-center text-gfast-g500 py-8">{t('loading')}</p>
          ) : estimates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gfast-g500 mb-4">
                {lang === 'ar' ? 'لا توجد تقديرات' : 'No estimates yet'}
              </p>
              <button
                onClick={() => navigate('/analysis')}
                className="inline-block px-6 py-2 bg-gfast-blue text-white rounded-lg font-semibold hover:bg-gfast-blue-dark"
              >
                + {t('newEstimate')}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-gfast-g200">
                    <th className="text-left py-3 px-4 font-semibold text-gfast-g700">
                      {t('vehicle')}
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gfast-g700">
                      {lang === 'ar' ? 'الأجزاء' : 'Parts'}
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gfast-g700">
                      {t('total')}
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gfast-g700">
                      {t('status')}
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gfast-g700">
                      {t('createdAt')}
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-gfast-g700">
                      {lang === 'ar' ? 'إجراء' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {estimates.map((estimate) => (
                    <tr key={estimate.estimate_id} className="border-b border-gfast-g100 hover:bg-gfast-g50">
                      <td className="py-3 px-4">
                        <div className="font-medium">
                          {estimate.vehicle_year} {estimate.vehicle_make} {estimate.vehicle_model}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gfast-g600">
                        {estimate.parts?.length || 0} {lang === 'ar' ? 'أجزاء' : 'parts'}
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        {estimate.total_cost_max
                          ? `${estimate.total_cost_max.toLocaleString()} ${lang === 'ar' ? 'جنيه' : 'EGP'}`
                          : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(estimate.status)}`}>
                          {t(estimate.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gfast-g600">
                        {formatDate(estimate.created_at)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => navigate(`/estimate/${estimate.estimate_id}`)}
                          className="px-4 py-1 bg-gfast-blue text-white rounded hover:bg-gfast-blue-dark text-sm font-semibold"
                        >
                          {t('edit')}
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

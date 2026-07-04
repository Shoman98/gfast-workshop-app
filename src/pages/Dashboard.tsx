import { useLanguage } from '@/contexts/LanguageContext'
import { useNavigate } from 'react-router-dom'

export default function DashboardPage() {
  const { t, lang } = useLanguage()
  const navigate = useNavigate()

  return (
    <div className={`min-h-screen p-8 ${lang === 'ar' ? 'rtl' : 'ltr'}`}>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">{t('dashboard')}</h1>
          <button
            onClick={() => {
              localStorage.clear()
              navigate('/login')
            }}
            className="px-4 py-2 bg-gfast-red text-white rounded-lg"
          >
            {t('logout')}
          </button>
        </div>

        <button
          onClick={() => navigate('/analysis')}
          className="mb-8 px-6 py-3 bg-gfast-blue text-white rounded-lg font-semibold hover:bg-gfast-blue-dark"
        >
          + {t('newEstimate')}
        </button>

        <div className="bg-white rounded-2lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4">{t('recentEstimates')}</h2>
          <p className="text-gfast-g500">{t('loading')}</p>
        </div>
      </div>
    </div>
  )
}

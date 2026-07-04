import { useLanguage } from '@/contexts/LanguageContext'
import { useParams } from 'react-router-dom'

export default function EstimatePage() {
  const { t, lang } = useLanguage()
  const { estimateId } = useParams()

  return (
    <div className={`min-h-screen p-8 ${lang === 'ar' ? 'rtl' : 'ltr'}`}>
      <h1 className="text-3xl font-bold mb-8">{t('estimate')}</h1>
      <div className="bg-white rounded-2lg shadow-lg p-6">
        <p className="text-gfast-g500">Estimate {estimateId} coming soon...</p>
      </div>
    </div>
  )
}

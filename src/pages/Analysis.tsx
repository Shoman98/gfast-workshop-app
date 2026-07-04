import { useLanguage } from '@/contexts/LanguageContext'

export default function AnalysisPage() {
  const { t, lang } = useLanguage()

  return (
    <div className={`min-h-screen p-8 ${lang === 'ar' ? 'rtl' : 'ltr'}`}>
      <h1 className="text-3xl font-bold mb-8">{t('analysis')}</h1>
      <div className="bg-white rounded-2lg shadow-lg p-6">
        <p className="text-gfast-g500">Analysis form coming soon...</p>
      </div>
    </div>
  )
}

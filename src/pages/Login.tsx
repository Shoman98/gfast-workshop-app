import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '@/contexts/LanguageContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { t, lang, setLang } = useLanguage()
  const [workshopId, setWorkshopId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: workshopId, pin }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || t('invalidCredentials'))
        setLoading(false)
        return
      }

      // Store token and redirect
      localStorage.setItem('token', data.token)
      localStorage.setItem('workshop', JSON.stringify(data.workshop))
      navigate('/dashboard')
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br from-gfast-blue to-gfast-blue-dark ${lang === 'ar' ? 'rtl' : 'ltr'}`}>
      <div className="w-full max-w-md bg-white rounded-2lg shadow-lg p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gfast-blue">G-FAST</h1>
          <button
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="px-3 py-1 bg-gray-200 rounded text-sm font-semibold"
          >
            {lang === 'en' ? 'العربية' : 'English'}
          </button>
        </div>

        <h2 className="text-2xl font-bold mb-6 text-gfast-blue">{t('loginTitle')}</h2>

        {error && (
          <div className="mb-4 p-3 bg-gfast-red text-white rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2">{t('workshopId')}</label>
            <input
              type="text"
              value={workshopId}
              onChange={(e) => setWorkshopId(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-gfast-blue"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">{t('pin')}</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-gfast-blue"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gfast-blue text-white py-2 rounded-lg font-semibold hover:bg-gfast-blue-dark disabled:opacity-50"
          >
            {loading ? t('loading') : t('loginButton')}
          </button>
        </form>
      </div>
    </div>
  )
}

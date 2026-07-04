import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const navigate = useNavigate()
  const [workshopId, setWorkshopId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!workshopId || !pin) {
      setError('يرجى إدخال جميع البيانات')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: workshopId, pin }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'فشل تسجيل الدخول')
        setLoading(false)
        return
      }

      localStorage.setItem('token', data.token)
      localStorage.setItem('workshop', JSON.stringify(data.workshop))
      navigate('/dashboard')
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4 rtl" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-blue-600 mb-2">جي-فاست</h1>
          <p className="text-gray-600 text-lg font-medium">منصة تقييم أضرار المركبات</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border-r-4 border-red-500 text-red-700 rounded-lg text-sm font-medium">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              رقم الورشة
            </label>
            <input
              type="text"
              value={workshopId}
              onChange={(e) => setWorkshopId(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-right text-lg transition-colors"
              placeholder="مثال: test-workshop-1"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              الرمز السري
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-right text-lg transition-colors"
              placeholder="••••"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors mt-6"
          >
            {loading ? '⏳ جاري التحميل...' : '🔐 دخول'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">جي-فاست • نسخة تجريبية 1.0</p>
        </div>
      </div>
    </div>
  )
}

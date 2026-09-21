import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import { DamageReport, BookingStep } from './BrokerFnol'

/**
 * PUBLIC customer "return to my claim" page — reached via /claim/:fnolId.
 * After analysis the customer keeps their FNOL id; this page reloads their
 * saved damage report and lets them book a workshop later (or shows the
 * booking if they already did). Data: GET /api/broker/fnol-report/:id.
 */
export default function BrokerClaim() {
  const { fnolId = '' } = useParams()
  const [r, setR]       = useState<any>(null)
  const [state, setState] = useState<'loading' | 'notfound' | 'ready'>('loading')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/api/broker/fnol-report/${encodeURIComponent(fnolId)}`))
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.report) { setState('notfound'); return }
        setR(data.report); setState('ready')
      } catch { if (!cancelled) setState('notfound') }
    })()
    return () => { cancelled = true }
  }, [fnolId])

  const page: React.CSSProperties = {
    minHeight: '100dvh', background: '#f3f4f6', display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: 'clamp(12px,3vw,24px)', direction: 'rtl',
    fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box',
  }
  const card: React.CSSProperties = {
    background: 'white', borderRadius: 16, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
    padding: '22px', width: '100%', maxWidth: 480, boxSizing: 'border-box', marginBottom: 16,
  }

  if (state === 'loading') return <div style={page}><div style={{ ...card, textAlign: 'center', color: '#9ca3af', marginTop: 60 }}>جاري تحميل المطالبة…</div></div>
  if (state === 'notfound' || !r) return (
    <div style={page}><div style={{ ...card, textAlign: 'center', marginTop: 40 }}>
      <div style={{ fontSize: '2.2rem', marginBottom: 10 }}>🔎</div>
      <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>المطالبة غير موجودة</h1>
      <p style={{ color: '#6b7280', fontSize: '.9rem', margin: 0 }}>تأكد من رقم المطالبة أو رابط المتابعة.</p>
    </div></div>
  )

  const vehicle = [r.vehicle_year, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ')
  const booking = r.booking

  return (
    <div style={page}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg, #3F3D9E, #6366f1)', borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: '1.6rem' }}>📋</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: 0 }}>متابعة المطالبة</h1>
          <p style={{ color: '#6b7280', fontSize: '.85rem', marginTop: 6 }}>{r.broker_company}{vehicle ? ` · ${vehicle}` : ''}</p>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#3F3D9E', fontSize: '.8rem', marginTop: 8, wordBreak: 'break-all' }}>{fnolId}</div>
        </div>

        {/* Saved damage report */}
        {r.analysis_result && <DamageReport report={r.analysis_result} />}

        {/* Book, or show existing booking */}
        {booking ? (
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>🏢✅</div>
            <div style={{ fontWeight: 800, color: '#111827' }}>تم حجز ورشة</div>
            <div style={{ color: '#6b7280', fontSize: '.85rem', marginTop: 4 }}>
              {booking.workshop_name || 'ورشة'}{booking.city ? ` — ${booking.city}` : ''}{booking.scheduled_date ? ` · ${booking.scheduled_date}` : ''}
            </div>
            <div style={{ color: '#6b7280', fontSize: '.8rem', marginTop: 8 }}>ستتواصل معك الورشة لتأكيد موعد الإصلاح.</div>
          </div>
        ) : (
          <BookingStep
            fnolId={fnolId}
            customerMobile={r.customer_mobile || ''}
            vehicle={{ make: r.vehicle_make || '', model: r.vehicle_model || '', year: r.vehicle_year ? String(r.vehicle_year) : '' }}
            imageUrls={[...(r.general_images || []), ...(r.damage_images || [])]}
          />
        )}
      </div>
    </div>
  )
}

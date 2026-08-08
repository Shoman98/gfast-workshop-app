import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

interface AuditLog {
  id: string
  action_type: string
  action_description_ar: string
  timestamp: string
  field?: string
  old_value?: string
  new_value?: string
}

interface EstimateInfo {
  estimate_id: string
  vehicle_year: number
  vehicle_make: string
  vehicle_model: string
  vin_number?: string | null
  status: string
  created_at: string
}

const ACTION_ICON: Record<string, string> = {
  part_added: '➕',
  part_removed: '🗑',
  part_edited: '✏️',
  severity_changed: '🔄',
  price_changed: '💰',
  labor_changed: '🔧',
  estimate_confirmed: '✅',
  estimate_created: '📝',
}

export default function AuditTrailPage() {
  const { estimateId } = useParams<{ estimateId: string }>()
  const navigate = useNavigate()

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [estimate, setEstimate] = useState<EstimateInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!estimateId) return
    const token = localStorage.getItem('token')
    if (!token) { navigate('/login'); return }

    const fetchData = async () => {
      setLoading(true)
      try {
        const [auditRes, estimateRes] = await Promise.all([
          fetch(apiUrl(`/api/estimates/${estimateId}/audit-logs`), {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(apiUrl(`/api/estimates/${estimateId}`), {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        if (auditRes.ok) {
          const data = await auditRes.json()
          setLogs(data.logs || [])
        }

        if (estimateRes.ok) {
          const data = await estimateRes.json()
          setEstimate(data.estimate || data || null)
        }
      } catch {
        setError('تعذّر تحميل سجل التعدي��ات')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [estimateId, navigate])

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', direction: 'rtl' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>📋 سجل ا��تعديلات</h1>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ padding: '0.5rem 1.25rem', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}
          >← الرجوع للوحة</button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>
        {/* Estimate info card */}
        {estimate && (
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.2rem' }}>المركبة</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
                {estimate.vehicle_make} {estimate.vehicle_model} {estimate.vehicle_year}
              </div>
            </div>
            {estimate.vin_number && (
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.2rem' }}>رقم الشاسيه</div>
                <div style={{ fontWeight: 600, fontFamily: 'monospace', color: '#374151' }}>{estimate.vin_number}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.2rem' }}>رقم المقايسة</div>
              <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem', color: '#374151' }}>{estimateId}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.2rem' }}>تا��يخ الإنشاء</div>
              <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.875rem' }}>{formatDate(estimate.created_at)}</div>
            </div>
            <div style={{ marginInlineStart: 'auto' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.2rem' }}>إجمالي التعديلات</div>
              <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#2563eb' }}>{logs.length}</div>
            </div>
          </div>
        )}

        {/* Audit log timeline */}
        <div style={{ background: 'white', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f3f4f6', fontWeight: 700, color: '#374151', fontSize: '0.95rem' }}>
            سجل جميع التعديلات
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>… جارٍ التحميل</div>
          ) : error ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#dc2626' }}>{error}</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
              لا توجد تعديلات مسجلة لهذه المقايسة
            </div>
          ) : (
            <div>
              {logs.map((log, index) => (
                <div
                  key={log.id}
                  style={{
                    display: 'flex', gap: '1rem', alignItems: 'flex-start',
                    padding: '1rem 1.5rem',
                    borderBottom: index < logs.length - 1 ? '1px solid #f9fafb' : 'none',
                    background: index % 2 === 0 ? 'white' : '#fafafa',
                  }}
                >
                  {/* Icon */}
                  <div style={{ fontSize: '1.2rem', flexShrink: 0, marginTop: '0.1rem' }}>
                    {ACTION_ICON[log.action_type] || '📌'}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                      {log.action_description_ar}
                    </div>
                    {(log.old_value || log.new_value) && (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                        {log.old_value && (
                          <span style={{ padding: '0.15rem 0.5rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.375rem', fontSize: '0.78rem', color: '#dc2626', fontFamily: 'monospace' }}>
                            {log.old_value}
                          </span>
                        )}
                        {log.old_value && log.new_value && <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>←</span>}
                        {log.new_value && (
                          <span style={{ padding: '0.15rem 0.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.375rem', fontSize: '0.78rem', color: '#16a34a', fontFamily: 'monospace' }}>
                            {log.new_value}
                          </span>
                        )}
                      </div>
                    )}
                    {log.field && (
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>الحقل: {log.field}</div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div style={{ flexShrink: 0, fontSize: '0.75rem', color: '#9ca3af', textAlign: 'left', whiteSpace: 'nowrap' }}>
                    {formatDate(log.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

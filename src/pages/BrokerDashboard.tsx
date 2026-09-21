import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import { getBrokerSession, clearBrokerSession } from '@/components/BrokerProtectedRoute'

interface BrokerCase {
  id: string
  vin: string
  stage: 'fnol' | 'booked' | 'assessed'
  created_at: string
  updated_at: string
  fnol: {
    vehicle_license?: string
    customer_mobile?: string
    vehicle_make?: string
    vehicle_model?: string
    vehicle_year?: number
    location?: string
    submitted_at: string
    booking_at?: string
    assessment_at?: string
    report_url?: string
  } | null
  booking: {
    id: string
    status: string
    scheduled_date?: string
    workshop?: { workshop_name: string; display_name: string | null; city: string | null }
  } | null
}

const STAGE_META = {
  fnol:     { label: 'FNOL Submitted',   color: '#3F3D9E', bg: '#eff6ff', dot: '#3F3D9E' },
  booked:   { label: 'Workshop Booked',  color: '#d97706', bg: '#fffbeb', dot: '#d97706' },
  assessed: { label: 'Assessment Done',  color: '#15803d', bg: '#f0fdf4', dot: '#15803d' },
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function BrokerDashboard() {
  const navigate  = useNavigate()
  const session   = getBrokerSession()
  const [cases, setCases]     = useState<BrokerCase[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  useEffect(() => {
    if (!session) return
    fetch(apiUrl('/api/broker/cases'), { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json())
      .then(d => setCases(d.cases || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = cases.filter(c => {
    const q = search.toLowerCase()
    return !q || c.vin.toLowerCase().includes(q)
      || c.fnol?.vehicle_license?.toLowerCase().includes(q)
      || c.fnol?.customer_mobile?.includes(q)
      || `${c.fnol?.vehicle_make} ${c.fnol?.vehicle_model}`.toLowerCase().includes(q)
      || c.booking?.workshop?.workshop_name?.toLowerCase().includes(q)
  })

  function logout() { clearBrokerSession(); navigate('/broker/login') }

  const s: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    header: { background: '#0f172a', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    body: { maxWidth: 1100, margin: '0 auto', padding: '28px 20px' },
    card: { background: 'white', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden' },
    th: { padding: '10px 16px', textAlign: 'left' as const, fontSize: '.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '.04em', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' },
    td: { padding: '12px 16px', fontSize: '.875rem', color: '#374151', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle' as const },
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <span style={{ color: '#60a5fa', fontWeight: 800, fontSize: '1rem' }}>G-FAST</span>
          <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '.8rem', marginLeft: 10 }}>Broker Portal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,.9)', fontSize: '.85rem', fontWeight: 600 }}>{session?.broker.name}</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '.75rem' }}>{session?.broker.company}</div>
          </div>
          <button onClick={logout}
            style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: 'white', borderRadius: 8, padding: '6px 14px', fontSize: '.8rem', cursor: 'pointer', fontWeight: 600 }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={s.body}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          {(['fnol', 'booked', 'assessed'] as const).map(st => {
            const meta = STAGE_META[st]
            const count = cases.filter(c => c.stage === st).length
            return (
              <div key={st} style={{ background: meta.bg, border: `1.5px solid ${meta.dot}30`, borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: meta.color }}>{count}</div>
                <div style={{ fontSize: '.85rem', fontWeight: 600, color: meta.color, marginTop: 2 }}>{meta.label}</div>
              </div>
            )
          })}
        </div>

        {/* Customer link */}
        {session?.broker.link_token && (
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 14, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, color: '#0369a1', fontSize: '.9rem' }}>📎 Your Customer FNOL Link</div>
              <div style={{ color: '#0284c7', fontSize: '.82rem', marginTop: 3, fontFamily: 'monospace' }}>
                {window.location.origin}/broker/fnol/{session.broker.link_token}
              </div>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/broker/fnol/${session?.broker.link_token}`)}
              style={{ background: '#0369a1', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: '.82rem', fontWeight: 700, cursor: 'pointer' }}>
              Copy Link
            </button>
          </div>
        )}

        {/* Cases table */}
        <div style={s.card}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: '1.05rem', color: '#111827', margin: 0 }}>Cases</h2>
              <p style={{ color: '#6b7280', fontSize: '.8rem', margin: '2px 0 0' }}>{cases.length} total · {filtered.length} shown</p>
            </div>
            <input
              placeholder="Search VIN, mobile, vehicle…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding: '8px 14px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '.85rem', width: 240, outline: 'none' }}
            />
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              {cases.length === 0 ? 'No cases yet. Share your customer link to get started.' : 'No results.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={s.th}>VIN</th>
                    <th style={s.th}>Vehicle</th>
                    <th style={s.th}>Customer</th>
                    <th style={s.th}>FNOL Date</th>
                    <th style={s.th}>Workshop</th>
                    <th style={s.th}>Stage</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const meta = STAGE_META[c.stage]
                    const wsName = c.booking?.workshop?.display_name || c.booking?.workshop?.workshop_name
                    return (
                      <tr key={c.id} style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/broker/case/${encodeURIComponent(c.vin)}`)}>
                        <td style={s.td}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '.82rem', color: '#111827' }}>{c.vin}</span>
                          {c.fnol?.vehicle_license && (
                            <div style={{ fontSize: '.72rem', color: '#6b7280', marginTop: 2 }}>🔖 {c.fnol.vehicle_license}</div>
                          )}
                        </td>
                        <td style={s.td}>{[c.fnol?.vehicle_year, c.fnol?.vehicle_make, c.fnol?.vehicle_model].filter(Boolean).join(' ') || '—'}</td>
                        <td style={s.td}>{c.fnol?.customer_mobile || '—'}</td>
                        <td style={s.td}>{fmtDate(c.fnol?.submitted_at)}</td>
                        <td style={s.td}>{wsName || <span style={{ color: '#9ca3af' }}>Not booked</span>}</td>
                        <td style={s.td}>
                          <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.dot}40`, borderRadius: 999, padding: '3px 10px', fontSize: '.75rem', fontWeight: 700 }}>
                            {meta.label}
                          </span>
                        </td>
                        <td style={s.td}>
                          <span style={{ color: '#3F3D9E', fontWeight: 700, fontSize: '.82rem' }}>View →</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

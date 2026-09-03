import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

// ── Types ──────────────────────────────────────────────────────────────────
interface Workshop {
  workshop_id: string
  workshop_name: string
  display_name: string | null
  city: string | null
  phone: string | null
  is_active: boolean
  is_visible_to_consumers: boolean
  is_super_admin: boolean
  stars: number
  review_text: string | null
  is_new: boolean
  badges: string[]
  sort_order: number
  logo_url: string | null
  accepts_insurance: boolean
}

interface Branch {
  branch_id: string
  workshop_id: string
  branch_name: string
  city: string | null
  phone: string | null
  is_active: boolean
}

interface Booking {
  id: string
  workshop_id: string
  customer_mobile: string
  report_url: string | null
  image_urls: string[]
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year: string | null
  status: string
  created_at: string
}

const BADGE_OPTIONS = ['Best Quality', 'Best Value', 'Fastest', 'Certified Center']
const BADGE_ICONS: Record<string, string> = { 'Best Quality': '⭐', 'Best Value': '💰', 'Fastest': '⚡', 'Certified Center': '🏅' }
const BADGE_LABELS_AR: Record<string, string> = { 'Certified Center': 'مركز معتمد' }
const STATUS_OPTIONS = ['pending', 'contacted', 'confirmed', 'completed', 'cancelled']
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#fff7ed', color: '#c2410c' },
  contacted: { bg: '#eff6ff', color: '#1d4ed8' },
  confirmed: { bg: '#f0fdf4', color: '#15803d' },
  completed: { bg: '#f9fafb', color: '#374151' },
  cancelled: { bg: '#fef2f2', color: '#dc2626' },
}

const th: React.CSSProperties = { padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700, color: '#374151', fontSize: '0.82rem', whiteSpace: 'nowrap', borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }
const td: React.CSSProperties = { padding: '0.65rem 0.75rem', fontSize: '0.82rem', color: '#111827', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' }

// ── Main Component ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const navigate = useNavigate()
  const token = () => localStorage.getItem('token') || ''
  const [tab, setTab] = useState<'marketplace' | 'bookings'>('marketplace')
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  // ── Workshops state ──
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [wsLoading, setWsLoading] = useState(false)
  const [_saving, setSaving] = useState(false)
  const dragIdx = useRef<number | null>(null)

  // ── Logo upload state ──
  const [logoUploading, setLogoUploading] = useState<string | null>(null)

  const uploadLogo = async (workshopId: string, file: File) => {
    setLogoUploading(workshopId)
    try {
      const fd = new FormData()
      fd.append('logo', file)
      const r = await fetch(apiUrl(`/api/admin/workshops/${workshopId}/logo`), { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: fd })
      const d = await r.json()
      if (r.ok) {
        setWorkshops(prev => prev.map(w => w.workshop_id === workshopId ? { ...w, logo_url: d.logo_url } : w))
        showToast('✓ Logo uploaded')
      } else showToast(d.error || 'Upload failed')
    } catch { showToast('Network error') }
    finally { setLogoUploading(null) }
  }

  // ── Branches state ──
  const [branchesMap, setBranchesMap] = useState<Record<string, Branch[]>>({})
  const [expandedBranches, setExpandedBranches] = useState<Record<string, boolean>>({})

  // ── Bookings state ──
  const [bookings, setBookings] = useState<Booking[]>([])
  const [bkLoading, setBkLoading] = useState(false)
  const [filterWs, setFilterWs] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const headers = { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }

  // ── Load workshops ──
  const loadWorkshops = async () => {
    setWsLoading(true)
    try {
      const r = await fetch(apiUrl('/api/admin/workshops'), { headers })
      const d = await r.json()
      if (r.ok) setWorkshops(d.workshops || [])
      else showToast('Failed to load workshops')
    } catch { showToast('Network error') }
    finally { setWsLoading(false) }
  }

  // ── Load bookings ──
  const loadBookings = async () => {
    setBkLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filterWs) qs.set('workshop_id', filterWs)
      if (filterStatus) qs.set('status', filterStatus)
      if (filterFrom) qs.set('from', filterFrom)
      if (filterTo) qs.set('to', filterTo)
      const r = await fetch(apiUrl(`/api/admin/bookings?${qs}`), { headers })
      const d = await r.json()
      if (r.ok) setBookings(d.bookings || [])
      else showToast('Failed to load bookings')
    } catch { showToast('Network error') }
    finally { setBkLoading(false) }
  }

  useEffect(() => { loadWorkshops() }, [])
  useEffect(() => { if (tab === 'bookings') loadBookings() }, [tab])

  // ── Save workshop field ──
  const saveWorkshop = async (id: string, updates: Partial<Workshop>) => {
    setSaving(true)
    try {
      const r = await fetch(apiUrl(`/api/admin/workshops/${id}`), { method: 'PATCH', headers, body: JSON.stringify(updates) })
      const d = await r.json()
      if (r.ok) {
        setWorkshops(prev => prev.map(w => w.workshop_id === id ? { ...w, ...d.workshop } : w))
        showToast('✓ Saved')
      } else showToast(d.error || 'Save failed')
    } catch { showToast('Network error') }
    finally { setSaving(false) }
  }

  // ── Branch management ──
  const loadBranches = async (workshopId: string) => {
    try {
      const r = await fetch(apiUrl(`/api/admin/workshops/${workshopId}/branches`), { headers })
      const d = await r.json()
      if (r.ok) setBranchesMap(prev => ({ ...prev, [workshopId]: d.branches || [] }))
    } catch { /* silent */ }
  }

  const toggleBranches = (workshopId: string) => {
    const next = !expandedBranches[workshopId]
    setExpandedBranches(prev => ({ ...prev, [workshopId]: next }))
    if (next && !branchesMap[workshopId]) loadBranches(workshopId)
  }

  // ── Update booking status ──
  const updateBookingStatus = async (id: string, status: string) => {
    try {
      const r = await fetch(apiUrl(`/api/admin/bookings/${id}`), { method: 'PATCH', headers, body: JSON.stringify({ status }) })
      const d = await r.json()
      if (r.ok) {
        setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
        showToast('✓ Status updated')
      } else showToast(d.error || 'Update failed')
    } catch { showToast('Network error') }
  }

  // ── Drag-to-reorder ──
  const onDragStart = (idx: number) => { dragIdx.current = idx }
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) return
    const reordered = [...workshops]
    const [moved] = reordered.splice(dragIdx.current, 1)
    reordered.splice(idx, 0, moved)
    dragIdx.current = idx
    setWorkshops(reordered)
  }
  const onDragEnd = async () => {
    dragIdx.current = null
    const order = workshops.map((w, i) => ({ workshop_id: w.workshop_id, sort_order: i }))
    try {
      await fetch(apiUrl('/api/admin/workshops/reorder'), { method: 'POST', headers, body: JSON.stringify({ order }) })
      setWorkshops(prev => prev.map((w, i) => ({ ...w, sort_order: i })))
      showToast('✓ Order saved')
    } catch { showToast('Reorder failed') }
  }

  // ── Set explicit rank (sort_order) — reflects in both consumer flows ──
  const setRank = async (id: string, rank: number) => {
    await saveWorkshop(id, { sort_order: rank })
    setWorkshops(prev =>
      prev
        .map(w => (w.workshop_id === id ? { ...w, sort_order: rank } : w))
        .sort((a, b) => a.sort_order - b.sort_order)
    )
    showToast('✓ Rank saved')
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleString('en-EG', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', direction: 'ltr' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 200, padding: '0.6rem 1.4rem', borderRadius: 8, color: 'white', fontWeight: 700, background: toast.startsWith('✓') ? '#16a34a' : '#dc2626', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#0f172a', padding: '0.9rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span style={{ color: '#60a5fa', fontWeight: 800, fontSize: '1.1rem' }}>G-FAST Admin</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['marketplace', 'bookings'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '0.45rem 1rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', background: tab === t ? '#2563eb' : 'rgba(255,255,255,0.1)', color: tab === t ? 'white' : 'rgba(255,255,255,0.7)' }}>
                {t === 'marketplace' ? '🏪 Marketplace' : '📋 Bookings'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => navigate('/dashboard')} style={{ padding: '0.45rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.8)', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}>← Dashboard</button>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem' }}>

        {/* ══ MARKETPLACE TAB ══ */}
        {tab === 'marketplace' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.2rem' }}>Workshop Marketplace</h2>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Drag rows to reorder • Changes save immediately</span>
            </div>

            {wsLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {workshops.filter(w => !w.is_super_admin).map((ws, idx) => (
                  <div
                    key={ws.workshop_id}
                    draggable
                    onDragStart={() => onDragStart(idx)}
                    onDragOver={e => onDragOver(e, idx)}
                    onDragEnd={onDragEnd}
                    style={{ background: 'white', borderRadius: 12, padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1.5px solid #e5e7eb', cursor: 'grab' }}
                  >
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      {/* Drag handle + rank + visibility */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 4, flexShrink: 0 }}>
                        <span style={{ color: '#9ca3af', fontSize: '1.1rem', cursor: 'grab' }}>⠿</span>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <input
                            type="number"
                            min="0"
                            key={`rank-${ws.workshop_id}-${ws.sort_order}`}
                            defaultValue={ws.sort_order}
                            title="Lower number shows first"
                            onBlur={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v !== ws.sort_order) setRank(ws.workshop_id, v) }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            style={{ width: 46, padding: '0.25rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.8rem', textAlign: 'center', boxSizing: 'border-box' }}
                          />
                          <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 600 }}>Rank</span>
                        </div>
                        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
                          <input type="checkbox" checked={ws.is_visible_to_consumers} onChange={e => saveWorkshop(ws.workshop_id, { is_visible_to_consumers: e.target.checked })} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                          <span style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 600 }}>Visible</span>
                        </label>
                      </div>

                      {/* Name + display name */}
                      <div style={{ flex: '0 0 180px', minWidth: 0 }}>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 2 }}>Login name</div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#374151' }}>{ws.workshop_name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 6, marginBottom: 2 }}>Display name (consumer-facing)</div>
                        <input
                          defaultValue={ws.display_name || ''}
                          placeholder="Same as login name"
                          onBlur={e => { if (e.target.value !== (ws.display_name || '')) saveWorkshop(ws.workshop_id, { display_name: e.target.value || null }) }}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem', boxSizing: 'border-box' }}
                        />
                      </div>

                      {/* Stars */}
                      <div style={{ flex: '0 0 100px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 2 }}>Stars (0–5)</div>
                        <input
                          type="number" min="0" max="5" step="0.1"
                          defaultValue={ws.stars}
                          onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== ws.stars) saveWorkshop(ws.workshop_id, { stars: v }) }}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem', boxSizing: 'border-box' }}
                        />
                        <div style={{ color: '#f59e0b', fontSize: '1rem', marginTop: 4 }}>{'★'.repeat(Math.floor(ws.stars))}{'☆'.repeat(5 - Math.floor(ws.stars))}</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.78rem', marginTop: 6, paddingTop: 6, borderTop: '1px solid #f3f4f6' }}>
                          <input
                            type="checkbox"
                            checked={ws.is_new || false}
                            onChange={e => {
                              saveWorkshop(ws.workshop_id, { is_new: e.target.checked })
                              setWorkshops(prev => prev.map(w => w.workshop_id === ws.workshop_id ? { ...w, is_new: e.target.checked } : w))
                            }}
                          />
                          🆕 جديد / New
                        </label>
                      </div>

                      {/* Review quote */}
                      <div style={{ flex: '1 1 200px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 2 }}>Review quote</div>
                        <input
                          defaultValue={ws.review_text || ''}
                          placeholder="Short customer review..."
                          onBlur={e => { if (e.target.value !== (ws.review_text || '')) saveWorkshop(ws.workshop_id, { review_text: e.target.value || null }) }}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem', boxSizing: 'border-box' }}
                        />
                      </div>

                      {/* Badges + Insurance */}
                      <div style={{ flex: '0 0 180px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 4 }}>Badges</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {BADGE_OPTIONS.map(b => (
                            <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
                              <input
                                type="checkbox"
                                checked={(ws.badges || []).includes(b)}
                                onChange={e => {
                                  const current = ws.badges || []
                                  const next = e.target.checked ? [...current, b] : current.filter(x => x !== b)
                                  saveWorkshop(ws.workshop_id, { badges: next })
                                  setWorkshops(prev => prev.map(w => w.workshop_id === ws.workshop_id ? { ...w, badges: next } : w))
                                }}
                              />
                              {BADGE_ICONS[b] || '🏅'} {BADGE_LABELS_AR[b] || b}
                            </label>
                          ))}
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.8rem', marginTop: 4, paddingTop: 4, borderTop: '1px solid #f3f4f6' }}>
                            <input
                              type="checkbox"
                              checked={ws.accepts_insurance || false}
                              onChange={e => {
                                saveWorkshop(ws.workshop_id, { accepts_insurance: e.target.checked })
                                setWorkshops(prev => prev.map(w => w.workshop_id === ws.workshop_id ? { ...w, accepts_insurance: e.target.checked } : w))
                              }}
                            />
                            🛡️ Insurance ✓
                          </label>
                        </div>
                      </div>

                      {/* Logo */}
                      <div style={{ flex: '0 0 120px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 4 }}>Logo / Icon</div>
                        {ws.logo_url && (
                          <img src={ws.logo_url} alt="logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid #e5e7eb', marginBottom: 6, display: 'block' }} />
                        )}
                        <label style={{ display: 'inline-block', cursor: 'pointer', fontSize: '0.75rem', color: '#2563eb', fontWeight: 600 }}>
                          {logoUploading === ws.workshop_id ? '⏳ Uploading...' : ws.logo_url ? '🔄 Change' : '⬆ Upload'}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            disabled={logoUploading === ws.workshop_id}
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(ws.workshop_id, f); e.target.value = '' }}
                          />
                        </label>
                      </div>

                      {/* City + Active */}
                      <div style={{ flex: '0 0 120px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 2 }}>City</div>
                        <div style={{ fontSize: '0.85rem', color: '#374151' }}>{ws.city || '—'}</div>
                        <div style={{ marginTop: 8 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: ws.is_active ? '#f0fdf4' : '#fef2f2', color: ws.is_active ? '#16a34a' : '#dc2626' }}>
                            {ws.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: ws.is_visible_to_consumers ? '#eff6ff' : '#f9fafb', color: ws.is_visible_to_consumers ? '#1d4ed8' : '#9ca3af' }}>
                            {ws.is_visible_to_consumers ? '👁 Visible' : 'Hidden'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ── Branch flag ── */}
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem' }}>
                      <button
                        onClick={() => toggleBranches(ws.workshop_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}
                      >
                        🏢 Branches
                        {branchesMap[ws.workshop_id] !== undefined && (
                          <span style={{ padding: '1px 7px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 800, background: branchesMap[ws.workshop_id].length > 0 ? '#eff6ff' : '#f9fafb', color: branchesMap[ws.workshop_id].length > 0 ? '#1d4ed8' : '#9ca3af' }}>
                            {branchesMap[ws.workshop_id].filter(b => b.is_active).length}/{branchesMap[ws.workshop_id].length}
                          </span>
                        )}
                        <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{expandedBranches[ws.workshop_id] ? '▲' : '▼'}</span>
                      </button>

                      {expandedBranches[ws.workshop_id] && (
                        <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {(branchesMap[ws.workshop_id] || []).length === 0 ? (
                            <div style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '0.4rem 0' }}>No branches assigned to this workshop.</div>
                          ) : (branchesMap[ws.workshop_id] || []).map(b => (
                            <div key={b.branch_id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: b.is_active ? '#f0fdf4' : '#f9fafb', borderRadius: 6, border: `1px solid ${b.is_active ? '#bbf7d0' : '#e5e7eb'}` }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1 }}>
                                <input
                                  type="checkbox"
                                  checked={b.is_active}
                                  onChange={async e => {
                                    const next = e.target.checked
                                    await fetch(apiUrl(`/api/admin/workshops/${ws.workshop_id}/branches/${b.branch_id}`), {
                                      method: 'PATCH', headers, body: JSON.stringify({ is_active: next })
                                    })
                                    setBranchesMap(prev => ({
                                      ...prev,
                                      [ws.workshop_id]: prev[ws.workshop_id].map(x => x.branch_id === b.branch_id ? { ...x, is_active: next } : x)
                                    }))
                                    showToast(`✓ ${b.branch_name} ${next ? 'enabled' : 'disabled'}`)
                                  }}
                                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#16a34a' }}
                                />
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>{b.branch_name}</span>
                              </label>
                              {b.phone && <span style={{ fontSize: '0.75rem', color: '#6b7280', direction: 'ltr' }}>📞 {b.phone}</span>}
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: b.is_active ? '#dcfce7' : '#f3f4f6', color: b.is_active ? '#16a34a' : '#9ca3af' }}>
                                {b.is_active ? 'Bookable' : 'Hidden'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ BOOKINGS TAB ══ */}
        {tab === 'bookings' && (
          <div>
            {/* Filters */}
            <div style={{ background: 'white', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>Workshop</div>
                <select value={filterWs} onChange={e => setFilterWs(e.target.value)} style={{ padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem' }}>
                  <option value="">All workshops</option>
                  {workshops.filter(w => !w.is_super_admin).map(w => <option key={w.workshop_id} value={w.workshop_id}>{w.display_name || w.workshop_name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>Status</div>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem' }}>
                  <option value="">All statuses</option>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>From</div>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>To</div>
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.82rem' }} />
              </div>
              <button onClick={loadBookings} style={{ padding: '0.45rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>Search</button>
              <button onClick={() => { setFilterWs(''); setFilterStatus(''); setFilterFrom(''); setFilterTo(''); setTimeout(loadBookings, 0) }} style={{ padding: '0.45rem 1rem', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>Clear</button>
              <span style={{ marginInlineStart: 'auto', fontSize: '0.82rem', color: '#6b7280', fontWeight: 600 }}>{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Bookings table */}
            <div style={{ background: 'white', borderRadius: 12, overflow: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              {bkLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
              ) : bookings.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>No bookings found</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th style={th}>Date</th>
                      <th style={th}>Workshop</th>
                      <th style={th}>Customer Mobile</th>
                      <th style={th}>Vehicle</th>
                      <th style={th}>Report</th>
                      <th style={th}>Images</th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map(b => {
                      const ws = workshops.find(w => w.workshop_id === b.workshop_id)
                      return (
                        <tr key={b.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={td}>{formatDate(b.created_at)}</td>
                          <td style={td}><span style={{ fontWeight: 600 }}>{ws?.display_name || ws?.workshop_name || b.workshop_id}</span></td>
                          <td style={td}><a href={`tel:${b.customer_mobile}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>{b.customer_mobile}</a></td>
                          <td style={td}>{[b.vehicle_make, b.vehicle_model, b.vehicle_year].filter(Boolean).join(' ') || '—'}</td>
                          <td style={td}>
                            {b.report_url
                              ? <a href={b.report_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>📄 View</a>
                              : <span style={{ color: '#9ca3af' }}>—</span>}
                          </td>
                          <td style={td}>
                            {b.image_urls && b.image_urls.length > 0 ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                {b.image_urls.slice(0, 4).map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                    <img src={url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid #e5e7eb' }} />
                                  </a>
                                ))}
                                {b.image_urls.length > 4 && <span style={{ fontSize: '0.75rem', color: '#6b7280', alignSelf: 'center' }}>+{b.image_urls.length - 4}</span>}
                              </div>
                            ) : <span style={{ color: '#9ca3af' }}>—</span>}
                          </td>
                          <td style={td}>
                            <select
                              value={b.status}
                              onChange={e => updateBookingStatus(b.id, e.target.value)}
                              style={{ padding: '0.3rem 0.5rem', borderRadius: 6, border: `1.5px solid ${STATUS_COLORS[b.status]?.color || '#d1d5db'}`, background: STATUS_COLORS[b.status]?.bg || 'white', color: STATUS_COLORS[b.status]?.color || '#374151', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                            >
                              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

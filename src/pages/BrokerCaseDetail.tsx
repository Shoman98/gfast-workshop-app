import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import { getBrokerSession } from '@/components/BrokerProtectedRoute'

interface CaseDetail {
  id: string
  vin: string
  stage: 'fnol' | 'booked' | 'assessed'
  assessment_notes?: string
  assessment_estimate?: number
  assessment_url?: string
  fnol: {
    id: string
    customer_mobile?: string
    vehicle_make?: string; vehicle_model?: string; vehicle_year?: number
    location?: string
    general_images: string[]
    damage_images: string[]
    doc_urls: string[]
    analysis_result?: any
    report_url?: string
    submitted_at: string
    booking_at?: string
    assessment_at?: string
  } | null
  booking: {
    id: string
    status: string
    scheduled_date?: string
    created_at: string
    workshop?: { workshop_id: string; workshop_name: string; display_name: string | null; city: string | null }
    branch?: { branch_name: string } | null
  } | null
}

function fmtDate(d?: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Renders the Gemini damage report exactly as the customer saw it (Arabic-first,
// same fields the wreck-vision report uses: part name, Repair/Replace, damage types, description).
function DamageAnalysis({ analysis }: { analysis: any }) {
  const card: React.CSSProperties = { background: 'white', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden', marginBottom: 20 }
  const cardHeader: React.CSSProperties = { padding: '14px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '.9rem', color: '#111827' }

  if (!analysis) return (
    <div style={{ ...card, padding: 40, textAlign: 'center', color: '#9ca3af' }}>
      No analysis report available for this FNOL.
    </div>
  )

  const partName = (d: any) => d.nameAr || d.nameEn || d.part || d.partName || 'Unknown part'

  // Prefer the pre-grouped report the customer saw (identical dedupe/confidence/mapping).
  // Fall back to raw severity split for older FNOLs without broker_report.
  const rep = analysis.broker_report
  let repairable: any[], replaceable: any[], needsCheck: any[]
  if (rep) {
    repairable  = rep.repairable  || []
    replaceable = rep.replaceable || []
    needsCheck  = rep.needsCheck  || []
  } else {
    const damages: any[] = analysis.damages || []
    const isReplace = (d: any) => (d.severityDecision ?? (d.severityIndex >= 4 ? 'Replace' : 'Repair')) === 'Replace'
    repairable  = damages.filter(d => !isReplace(d))
    replaceable = damages.filter(d => isReplace(d))
    needsCheck  = []
  }
  const damages = [...repairable, ...replaceable, ...needsCheck]

  const PartList = ({ items, title, color, dot }: { items: any[]; title: string; color: string; dot: string }) => (
    <div style={{ ...card }} dir="rtl">
      <div style={{ ...cardHeader, color }}>{title} ({items.length})</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
        {items.map((d, i) => (
          <li key={i} style={{ padding: '10px 20px', borderBottom: i < items.length - 1 ? '1px solid #f8fafc' : 'none' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '.9rem', color: '#111827' }}>
              <span style={{ color: dot }}>●</span> {partName(d)}
            </span>
            {d.description && <div style={{ marginTop: 6, fontSize: '.8rem', color: '#6b7280', lineHeight: 1.5 }}>{d.description}</div>}
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div>
      {damages.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: '#9ca3af' }}>No damages detected in the uploaded photos.</div>
      ) : (
        <>
          {repairable.length > 0 && <PartList items={repairable} title="🔧 قطع قابلة للإصلاح" color="#15803d" dot="#16a34a" />}
          {replaceable.length > 0 && <PartList items={replaceable} title="🔩 قطع تحتاج استبدال" color="#b91c1c" dot="#dc2626" />}
          {needsCheck.length > 0 && <PartList items={needsCheck} title="🔍 تحتاج فحص" color="#b45309" dot="#d97706" />}
        </>
      )}
    </div>
  )
}

function TimelineDot({ done, active }: { done: boolean; active: boolean }) {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
      background: done ? '#15803d' : active ? '#3F3D9E' : '#e5e7eb',
      border: active ? '3px solid #a5b4fc' : 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontSize: 11, fontWeight: 700,
    }}>
      {done ? '✓' : ''}
    </div>
  )
}

export default function BrokerCaseDetail() {
  const { vin } = useParams<{ vin: string }>()
  const navigate = useNavigate()
  const session  = getBrokerSession()
  const [caseData, setCaseData] = useState<CaseDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [tab, setTab]           = useState<'report' | 'timeline' | 'photos' | 'docs'>('report')

  useEffect(() => {
    if (!session || !vin) return
    fetch(apiUrl(`/api/broker/case/${encodeURIComponent(vin)}`), {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then(r => r.json())
      .then(d => setCaseData(d.case || null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [vin])

  const s: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    header: { background: '#0f172a', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
    body: { maxWidth: 860, margin: '0 auto', padding: '24px 20px 60px' },
    card: { background: 'white', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden', marginBottom: 20 },
    cardHeader: { padding: '14px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '.9rem', color: '#111827' },
    row: { display: 'flex', gap: 12, padding: '10px 20px', borderBottom: '1px solid #f8fafc', fontSize: '.875rem', alignItems: 'flex-start' },
    label: { color: '#6b7280', fontWeight: 600, width: 140, flexShrink: 0, fontSize: '.8rem', paddingTop: 1 },
    value: { color: '#111827', flex: 1, fontWeight: 500 },
  }

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '4px solid #3F3D9E', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (!caseData) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>❌</div>
        <h2 style={{ fontWeight: 800 }}>Case not found</h2>
        <button onClick={() => navigate('/broker/dashboard')}
          style={{ marginTop: 16, padding: '10px 24px', background: '#3F3D9E', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
          ← Back to Dashboard
        </button>
      </div>
    </div>
  )

  const stages: Array<{ key: CaseDetail['stage']; label: string; ts?: string | null; icon: string }> = [
    { key: 'fnol',     label: 'FNOL Submitted',       ts: caseData.fnol?.submitted_at,   icon: '📋' },
    { key: 'booked',   label: 'Workshop Booked',       ts: caseData.fnol?.booking_at,     icon: '🏢' },
    { key: 'assessed', label: 'Assessment Confirmed',  ts: caseData.fnol?.assessment_at,  icon: '✅' },
  ]
  const stageIdx = ['fnol', 'booked', 'assessed'].indexOf(caseData.stage)

  const allImages = [...(caseData.fnol?.general_images || []), ...(caseData.fnol?.damage_images || [])]

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={() => navigate('/broker/dashboard')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: '.9rem', fontWeight: 600 }}>
          ← Cases
        </button>
        <div>
          <span style={{ color: '#60a5fa', fontWeight: 800, fontSize: '1rem' }}>G-FAST</span>
          <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '.8rem', marginLeft: 10 }}>Case Detail</span>
        </div>
      </div>

      <div style={s.body}>
        {/* VIN + stage banner */}
        <div style={{ ...s.card, background: '#0f172a', color: 'white', padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.5)', fontWeight: 600, marginBottom: 4 }}>VIN</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.4rem', letterSpacing: 2 }}>{caseData.vin}</div>
              <div style={{ color: 'rgba(255,255,255,.6)', fontSize: '.85rem', marginTop: 4 }}>
                {[caseData.fnol?.vehicle_year, caseData.fnol?.vehicle_make, caseData.fnol?.vehicle_model].filter(Boolean).join(' ') || ''}
              </div>
            </div>
            <div style={{ background: stageIdx === 2 ? '#15803d' : stageIdx === 1 ? '#d97706' : '#3F3D9E', borderRadius: 999, padding: '6px 16px', fontSize: '.8rem', fontWeight: 700 }}>
              {stages[stageIdx].icon} {stages[stageIdx].label}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'white', borderRadius: 12, padding: 4, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
          {(['report', 'timeline', 'photos', 'docs'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', transition: 'all .2s',
                background: tab === t ? '#3F3D9E' : 'transparent',
                color: tab === t ? 'white' : '#6b7280' }}>
              {t === 'report' ? '🔍 Report' : t === 'timeline' ? '📋 Timeline' : t === 'photos' ? `📷 Photos (${allImages.length})` : `📄 Docs (${caseData.fnol?.doc_urls.length || 0})`}
            </button>
          ))}
        </div>

        {/* ── REPORT TAB (the Gemini damage report the customer saw) ── */}
        {tab === 'report' && (
          <DamageAnalysis analysis={caseData.fnol?.analysis_result} />
        )}

        {/* ── TIMELINE TAB ── */}
        {tab === 'timeline' && (
          <>
            {/* Timeline */}
            <div style={s.card}>
              <div style={s.cardHeader}>Journey Timeline</div>
              <div style={{ padding: '20px 24px' }}>
                {stages.map((st, i) => {
                  const done   = i < stageIdx
                  const active = i === stageIdx
                  const next   = i > stageIdx
                  return (
                    <div key={st.key} style={{ display: 'flex', gap: 16, paddingBottom: i < stages.length - 1 ? 24 : 0, position: 'relative' }}>
                      {/* connector line */}
                      {i < stages.length - 1 && (
                        <div style={{ position: 'absolute', left: 9, top: 20, width: 2, height: 'calc(100% - 4px)', background: done ? '#16a34a40' : '#e5e7eb' }} />
                      )}
                      <TimelineDot done={done} active={active} />
                      <div style={{ flex: 1, paddingBottom: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '.9rem', color: next ? '#9ca3af' : '#111827' }}>
                          {st.icon} {st.label}
                        </div>
                        {st.ts
                          ? <div style={{ fontSize: '.78rem', color: '#6b7280', marginTop: 3 }}>{fmtDate(st.ts)}</div>
                          : <div style={{ fontSize: '.78rem', color: '#9ca3af', marginTop: 3 }}>Pending</div>
                        }

                        {/* FNOL details */}
                        {st.key === 'fnol' && caseData.fnol && (
                          <div style={{ marginTop: 10, background: '#f8fafc', borderRadius: 10, padding: '12px 16px', display: 'grid', gap: 6 }}>
                            {caseData.fnol.customer_mobile && <div style={{ fontSize: '.8rem' }}><span style={{ color: '#6b7280', fontWeight: 600 }}>Customer: </span>{caseData.fnol.customer_mobile}</div>}
                            {caseData.fnol.location && <div style={{ fontSize: '.8rem' }}><span style={{ color: '#6b7280', fontWeight: 600 }}>Location: </span>{caseData.fnol.location}</div>}
                            <div style={{ fontSize: '.8rem' }}>
                              <span style={{ color: '#6b7280', fontWeight: 600 }}>Photos: </span>
                              {caseData.fnol.general_images.length} general + {caseData.fnol.damage_images.length} damage
                            </div>
                            {caseData.fnol.report_url && (
                              <a href={caseData.fnol.report_url} target="_blank" rel="noreferrer"
                                style={{ fontSize: '.78rem', color: '#3F3D9E', fontWeight: 700 }}>View Analysis Report →</a>
                            )}
                          </div>
                        )}

                        {/* Booking details */}
                        {st.key === 'booked' && caseData.booking && (
                          <div style={{ marginTop: 10, background: '#fffbeb', borderRadius: 10, padding: '12px 16px', display: 'grid', gap: 6 }}>
                            <div style={{ fontSize: '.85rem', fontWeight: 700 }}>
                              {caseData.booking.workshop?.display_name || caseData.booking.workshop?.workshop_name}
                              {caseData.booking.branch?.branch_name ? ` › ${caseData.booking.branch.branch_name}` : ''}
                            </div>
                            {caseData.booking.workshop?.city && <div style={{ fontSize: '.78rem', color: '#6b7280' }}>{caseData.booking.workshop.city}</div>}
                            {caseData.booking.scheduled_date && (
                              <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#d97706' }}>
                                📅 Appointment: {new Date(caseData.booking.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Assessment details */}
                        {st.key === 'assessed' && caseData.stage === 'assessed' && (
                          <div style={{ marginTop: 10, background: '#f0fdf4', borderRadius: 10, padding: '12px 16px', display: 'grid', gap: 6 }}>
                            {caseData.assessment_estimate != null && (
                              <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#15803d' }}>
                                Estimate: {Number(caseData.assessment_estimate).toLocaleString()} EGP
                              </div>
                            )}
                            {caseData.assessment_notes && <div style={{ fontSize: '.8rem', color: '#374151' }}>{caseData.assessment_notes}</div>}
                            {caseData.assessment_url && (
                              <a href={caseData.assessment_url} target="_blank" rel="noreferrer"
                                style={{ fontSize: '.78rem', color: '#15803d', fontWeight: 700 }}>View Assessment Report →</a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ── PHOTOS TAB ── */}
        {tab === 'photos' && (
          <div style={s.card}>
            <div style={s.cardHeader}>Photos ({allImages.length})</div>
            {allImages.length === 0
              ? <div style={{ padding: '30px', textAlign: 'center', color: '#9ca3af' }}>No photos uploaded</div>
              : (
                <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  {allImages.map((url, i) => (
                    <img key={i} src={url} alt="" onClick={() => setLightbox(url)}
                      style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in' }} />
                  ))}
                </div>
              )
            }
          </div>
        )}

        {/* ── DOCS TAB ── */}
        {tab === 'docs' && (
          <div style={s.card}>
            <div style={s.cardHeader}>Documents ({caseData.fnol?.doc_urls.length || 0})</div>
            {(caseData.fnol?.doc_urls.length || 0) === 0
              ? <div style={{ padding: '30px', textAlign: 'center', color: '#9ca3af' }}>No documents uploaded</div>
              : (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {caseData.fnol?.doc_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', color: '#3F3D9E', fontWeight: 700, fontSize: '.875rem', textDecoration: 'none' }}>
                      📄 Document {i + 1}
                      <span style={{ marginLeft: 'auto', fontSize: '.75rem', color: '#6b7280' }}>Open ↗</span>
                    </a>
                  ))}
                </div>
              )
            }
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <img src={lightbox} alt="" style={{ maxWidth: '95%', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}

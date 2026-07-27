import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getInsuranceSession } from '@/mock/insurance'
import { apiUrl } from '@/lib/api'

interface LaborGroup { labor_name_ar: string; total: number; parts: string[]; comment?: string }
interface PartPrice   { part_name_ar: string; price: number }
interface PricingData {
  repair_groups: LaborGroup[]
  replace_groups: LaborGroup[]
  part_prices: PartPrice[]
  total_repair: number
  total_replace_labor: number
  total_parts: number
  grand_total: number
}
interface EstimatePart {
  part_name_ar: string
  severity_label: 'Repair' | 'Replace'
  ai_original_severity: 'Repair' | 'Replace' | null
  is_ai_detected: boolean
  price?: number
}
interface ExtraImage { id: string; cloudinary_url: string; pending?: boolean }

interface Claim {
  estimate_id: string
  workshop_id: string
  vehicle_year: number
  vehicle_make: string
  vehicle_model: string
  vin_number?: string
  customer_name?: string
  customer_mobile?: string
  confirmed_at: string
  status: string
  insurance_action?: string
  pricing_data?: PricingData
  insurance_negotiated_pricing?: PricingData
  workshop_counter_offer_pricing?: PricingData
  estimate_parts: EstimatePart[]
  workshop_labor_comments?: Record<string, string>
  workshop_part_comments?: Record<string, string>
  insurance_part_comments?: { part_name_ar: string; comment: string }[]
  extra_images_by_workshop?: ExtraImage[]
}

type Mode = 'view' | 'reject' | 'negotiate'

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  confirmed:             { label: 'جديد',                           color: '#1d4ed8', bg: '#eff6ff' },
  approved_by_insurance: { label: 'موافقه من التامين',    color: '#16a34a', bg: '#f0fdf4' },
  rejected_by_insurance: { label: 'رفض التأمين',          color: '#dc2626', bg: '#fef2f2' },
  counter_offer:         { label: 'عرض مضاد من الورشة',          color: '#d97706', bg: '#fffbeb' },
  workshop_revised:      { label: 'رد الورشة — للمراجعة',         color: '#7c3aed', bg: '#f5f3ff' },
  workshop_accepted:     { label: 'الورشة وافقت — بانتظار موافقتك', color: '#0891b2', bg: '#ecfeff' },
  settled:               { label: 'تمت التسوية',           color: '#059669', bg: '#ecfdf5' },
}

function FlagBadge({ type }: { type: 'added' | 'changed' }) {
  const s: Record<string, React.CSSProperties> = {
    added:   { background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: '999px', padding: '2px 9px', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' },
    changed: { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '999px', padding: '2px 9px', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' },
  }
  return <span style={s[type]}>{type === 'added' ? '+ مضاف' : '⚠ تغيير'}</span>
}

export default function InsuranceClaimDetail() {
  const navigate        = useNavigate()
  const { estimateId }  = useParams()
  const session         = getInsuranceSession()

  const [claim, setClaim]       = useState<Claim | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [mode, setMode]         = useState<Mode>('view')
  const [rejectComment, setRejectComment] = useState('')

  // Negotiate: only labor totals (insurance cannot edit part prices)
  const [, setNegLaborTotals]   = useState<Record<string, number>>({})
  // Comments: per part and per labor group
  const [partComments, setPartComments]       = useState<Record<string, string>>({})
  const [laborComments, setLaborComments]     = useState<Record<string, string>>({})
  const [showPartComment, setShowPartComment] = useState<Record<string, boolean>>({})
  const [showLaborComment, setShowLaborComment] = useState<Record<string, boolean>>({})

  const [confirmDialog, setConfirmDialog] = useState<{ action: string; title: string; body: string } | null>(null)
  const [submitting, setSubmitting]       = useState(false)
  const [extraImagesOpen, setExtraImagesOpen] = useState(false)
  const [lightboxUrl, setLightboxUrl]     = useState<string | null>(null)

  useEffect(() => {
    if (!session) { navigate('/insurance/login'); return }
    if (!estimateId) { navigate('/insurance/dashboard'); return }
    load()
    // Re-fetch whenever the tab regains focus so both sides stay in sync
    const onFocus = () => load(true)
    window.addEventListener('focus', onFocus)
    // Poll every 4s so the insurance side picks up the workshop's live edits/comments
    const poll = setInterval(() => {
      if (!document.hidden) load(true)
    }, 4000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(poll)
    }
  }, [estimateId])

  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      // Try fetching the specific claim first (returns full data incl. workshop_counter_offer_pricing)
      let c: any = null
      const detailRes = await fetch(apiUrl(`/api/insurance/claims/${estimateId}?company_id=${session!.company_id}`))
      if (detailRes.ok) {
        const detailData = await detailRes.json()
        c = detailData.claim || detailData
      } else {
        // Fall back to bulk endpoint
        const res = await fetch(apiUrl(`/api/insurance/claims?company_id=${session!.company_id}`))
        if (!res.ok) throw new Error('فشل تحميل المطالبة')
        const data = await res.json()
        c = data.claims.find((cl: any) => cl.estimate_id === estimateId)
      }
      if (!c) throw new Error('لم يتم العثور على المطالبة')
      setClaim(c)
      if (c.status === 'counter_offer') {
        setMode('negotiate')
      }
      // On silent polls, only refresh the claim (workshop's live edits/comments show
      // via `claim`). Don't re-init the insurance's own in-progress comment inputs.
      if (!silent && c.pricing_data) {
        const initTotals: Record<string, number> = {}
        const initComments: Record<string, string> = {}
        const initShowLabor: Record<string, boolean> = {}
        c.pricing_data.repair_groups?.forEach((g: LaborGroup) => {
          initTotals[`repair_${g.labor_name_ar}`] = g.total
          if (g.comment) { initComments[`repair_${g.labor_name_ar}`] = g.comment; initShowLabor[`repair_${g.labor_name_ar}`] = true }
        })
        c.pricing_data.replace_groups?.forEach((g: LaborGroup) => {
          initTotals[`replace_${g.labor_name_ar}`] = g.total
          if (g.comment) { initComments[`replace_${g.labor_name_ar}`] = g.comment; initShowLabor[`replace_${g.labor_name_ar}`] = true }
        })
        setNegLaborTotals(initTotals)
        setLaborComments(initComments)
        setShowLaborComment(initShowLabor)
      }
    } catch (e) { setError((e as Error).message) }
    finally     { setLoading(false) }
  }

  const getFlag = (partName: string): 'added' | 'changed' | null => {
    const p = claim?.estimate_parts?.find(ep => ep.part_name_ar === partName)
    if (!p) return null
    if (p.is_ai_detected === false) return 'added'
    if (p.ai_original_severity && p.ai_original_severity !== p.severity_label) return 'changed'
    return null
  }

  const openConfirm = (action: string) => {
    const map: Record<string, { title: string; body: string }> = {
      approved:           { title: 'تأكيد الموافقة',      body: 'هل تريد الموافقة على هذا التقدير؟ لا يمكن التراجع.' },
      rejected:           { title: 'تأكيد الرفض',         body: `هل تريد رفض هذا التقدير؟${rejectComment ? `\n\nالسبب: ${rejectComment}` : ''}` },
      negotiated:         { title: 'تأكيد عرض التفاوض',  body: 'هل تريد إرسال هذا العرض للورشة؟' },
      without_commitment: { title: 'تأكيد بدون التزام',   body: 'هل تريد تسجيل هذا الرد بدون التزام؟' },
    }
    setConfirmDialog({ action, ...map[action] })
  }

  const submit = async (action: string) => {
    if (!claim) return
    setSubmitting(true)
    try {
      let negotiated_pricing = null
      let part_comments_arr  = null

      if (action === 'negotiated' && claim.pricing_data) {
        // Prices stay UNCHANGED — insurance can only add comments
        const repGroups  = claim.pricing_data.repair_groups.map(g => ({
          labor_name_ar: g.labor_name_ar,
          total:   g.total,
          parts:   g.parts,
          comment: laborComments[`repair_${g.labor_name_ar}`]?.trim() || null,
        }))
        const repLGroups = claim.pricing_data.replace_groups.map(g => ({
          labor_name_ar: g.labor_name_ar,
          total:   g.total,
          parts:   g.parts,
          comment: laborComments[`replace_${g.labor_name_ar}`]?.trim() || null,
        }))
        const tParts   = claim.pricing_data.total_parts || 0
        const tRepair  = claim.pricing_data.total_repair || 0
        const tReplace = claim.pricing_data.total_replace_labor || 0
        negotiated_pricing = {
          part_prices: claim.pricing_data.part_prices.map(p => ({
            part_name_ar: p.part_name_ar,
            price: p.price,
          })),
          repair_groups:       repGroups,
          replace_groups:      repLGroups,
          total_parts:         tParts,
          total_repair:        tRepair,
          total_replace_labor: tReplace,
          grand_total:         tParts + tRepair + tReplace,
        }
        part_comments_arr = Object.entries(partComments)
          .filter(([, v]) => v.trim())
          .map(([part_name_ar, comment]) => ({ part_name_ar, comment }))
      }

      const res = await fetch(apiUrl(`/api/insurance/claims/${estimateId}/action`), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id:        session!.company_id,
          action,
          comment:           rejectComment || null,
          negotiated_pricing,
          part_comments:     part_comments_arr,
        }),
      })
      if (!res.ok) throw new Error('فشل تسجيل القرار')
      navigate('/insurance/dashboard')
    } catch (e) { setError((e as Error).message) }
    finally     { setSubmitting(false); setConfirmDialog(null) }
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>⏳ جاري التحميل...</div>
  if (error)   return <div style={{ padding: '3rem', textAlign: 'center', color: '#dc2626' }}>{error}</div>
  if (!claim)  return <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>لم يتم العثور على المطالبة</div>

  // Only images the workshop has actually sent (pending negotiate uploads stay workshop-only)
  const visibleExtraImages = (claim.extra_images_by_workshop || []).filter(i => !i.pending)

  // Show workshop's counter-offer if available, otherwise insurance's negotiated prices
  // Otherwise show the original pricing_data
  const pd = (
    claim.workshop_counter_offer_pricing
      ? claim.workshop_counter_offer_pricing
      : claim.status === 'workshop_accepted' && claim.insurance_negotiated_pricing
      ? claim.insurance_negotiated_pricing
      : claim.pricing_data
  )
  const statusCfg = STATUS_LABEL[claim.status] || STATUS_LABEL.confirmed

  const thBase: React.CSSProperties = { padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '0.8rem', borderBottom: '2px solid', background: 'inherit' }
  const td: React.CSSProperties     = { padding: '0.7rem 1rem', fontSize: '0.875rem', verticalAlign: 'top' }

  // Base pricing (insurance's offer) for before/after comparison when workshop has submitted edits
  const workshopBase = claim.workshop_counter_offer_pricing
    ? (claim.insurance_negotiated_pricing || claim.pricing_data)
    : null
  const removedParts   = workshopBase ? (workshopBase.part_prices   || []).filter(p => !(pd?.part_prices   || []).some(pp => pp.part_name_ar === p.part_name_ar)) : []
  const removedRepair  = workshopBase ? (workshopBase.repair_groups  || []).filter(g => !(pd?.repair_groups  || []).some(rg => rg.labor_name_ar === g.labor_name_ar)) : []
  const removedReplace = workshopBase ? (workshopBase.replace_groups || []).filter(g => !(pd?.replace_groups || []).some(rg => rg.labor_name_ar === g.labor_name_ar)) : []
  const basePartPrice    = (name: string) => workshopBase?.part_prices?.find(p => p.part_name_ar === name)?.price
  const baseRepairTotal  = (name: string) => workshopBase?.repair_groups?.find(g => g.labor_name_ar === name)?.total
  const baseReplaceTotal = (name: string) => workshopBase?.replace_groups?.find(g => g.labor_name_ar === name)?.total
  // Parts removed from within an existing labor group
  const removedLaborPartsMap: Record<string, string[]> = {}
  if (workshopBase) {
    ;(['repair', 'replace'] as const).forEach(type => {
      const baseGroups = type === 'repair' ? (workshopBase.repair_groups || []) : (workshopBase.replace_groups || [])
      const pdGroups   = type === 'repair' ? (pd?.repair_groups || [])          : (pd?.replace_groups || [])
      baseGroups.forEach(bg => {
        const pdGroup = pdGroups.find(g => g.labor_name_ar === bg.labor_name_ar)
        if (pdGroup) {
          const removed = bg.parts.filter(p => !pdGroup.parts.includes(p))
          if (removed.length > 0) removedLaborPartsMap[`${type}_${bg.labor_name_ar}`] = removed
        }
      })
    })
  }

  const RemovedBadge = () => (
    <span style={{ display: 'inline-block', marginRight: '0.4rem', padding: '1px 7px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '999px', color: '#dc2626', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>محذوف</span>
  )
  const AddedBadge = () => (
    <span style={{ display: 'inline-block', marginRight: '0.4rem', padding: '1px 7px', background: '#f0fdf4', border: '1px solid #16a34a', borderRadius: '999px', color: '#15803d', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>مضاف</span>
  )
  const PriceChange = ({ base, curr }: { base: number | undefined; curr: number }) => {
    if (base === undefined) return <>{curr.toLocaleString()}</>
    if (base === curr) return <>{curr.toLocaleString()}</>
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
        <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: '0.78rem' }}>{base.toLocaleString()}</span>
        <span style={{ color: curr < base ? '#16a34a' : '#dc2626', fontWeight: 800 }}>{curr.toLocaleString()}</span>
      </span>
    )
  }

  const CommentBtn = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
    <button onClick={onToggle} style={{
      padding: '0.2rem 0.5rem', background: show ? '#eff6ff' : '#f3f4f6',
      border: `1px solid ${show ? '#93c5fd' : '#d1d5db'}`, borderRadius: '0.375rem',
      cursor: 'pointer', fontSize: '0.75rem', color: show ? '#2563eb' : '#6b7280', flexShrink: 0,
    }}>💬</button>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '1.5rem 1rem', direction: 'rtl' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* ── HEADER ── */}
        <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '1.25rem', border: '1px solid #e5e7eb' }}>
          <button onClick={() => navigate('/insurance/dashboard')} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.9rem', cursor: 'pointer', marginBottom: '1rem', fontWeight: 600, padding: 0 }}>
            ← العودة للقائمة
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ margin: '0 0 0.35rem', color: '#111827', fontSize: '1.4rem', fontWeight: 800 }}>
                {claim.vehicle_make} {claim.vehicle_model} {claim.vehicle_year}
              </h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>
                {claim.workshop_id} · {new Date(claim.confirmed_at).toLocaleDateString('ar-EG')}
              </p>
              {(claim.customer_name || claim.vin_number) && (
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  {claim.customer_name   && <span style={{ fontSize: '0.82rem', color: '#374151' }}><b>العميل:</b> {claim.customer_name}</span>}
                  {claim.customer_mobile && <span style={{ fontSize: '0.82rem', color: '#374151' }}><b>الجوال:</b> {claim.customer_mobile}</span>}
                  {claim.vin_number      && <span style={{ fontSize: '0.82rem', color: '#374151' }}><b>VIN:</b> {claim.vin_number}</span>}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {visibleExtraImages.length > 0 && (
                <button
                  onClick={() => setExtraImagesOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', background: '#f5f3ff', border: '1.5px solid #7c3aed', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', color: '#7c3aed' }}
                >
                  🖼 {visibleExtraImages.length} صور الورشة
                </button>
              )}
              <button
                onClick={() => load()}
                style={{ padding: '0.35rem 0.85rem', background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', color: '#6b7280' }}
              >↺ تحديث</button>
              {claim.status !== 'confirmed' && (
                <span style={{ padding: '0.35rem 1rem', borderRadius: '999px', border: `1.5px solid ${statusCfg.color}`, color: statusCfg.color, backgroundColor: statusCfg.bg, fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                  {statusCfg.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── FLAG LEGEND ── */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.6rem', padding: '0.6rem 1rem', marginBottom: '1.25rem', display: 'flex', gap: '1.5rem', fontSize: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span><span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: '999px', padding: '1px 8px', fontWeight: 700 }}>+ مضاف</span> أضافته الورشة يدوياً</span>
          <span><span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '999px', padding: '1px 8px', fontWeight: 700 }}>⚠ تغيير</span> تبدّل الإجراء</span>
        </div>

        {pd ? (
          <>
            {/* ── Counter-offer notice + diff ── */}

            {/* ── 1. قطع الغيار (READ-ONLY — insurance cannot edit part prices) ── */}
            {pd.part_prices?.length > 0 && (
              <div style={{ background: 'white', borderRadius: '0.75rem', marginBottom: '1.25rem', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                <div style={{ padding: '0.85rem 1.25rem', background: '#f3f4f6', borderBottom: '2px solid #1e3a8a', fontWeight: 700, color: '#1e3a8a', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 400 }}>{mode === 'negotiate' ? '(أسعار ثابتة — غير قابلة للتعديل)' : ''}</span>
                  <span>قطع الغيار</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ ...thBase, borderColor: '#e5e7eb', width: '36px', textAlign: 'center' }}>#</th>
                      <th style={{ ...thBase, borderColor: '#e5e7eb' }}>القطعة</th>
                      <th style={{ ...thBase, borderColor: '#e5e7eb', width: '80px' }}></th>
                      <th style={{ ...thBase, borderColor: '#e5e7eb', textAlign: 'center', width: '130px' }}>السعر (ج.م)</th>
                      {mode === 'negotiate' && <th style={{ ...thBase, borderColor: '#e5e7eb', width: '55px', textAlign: 'center' }}>ملاحظة</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pd.part_prices.map((p, i) => {
                      const flag      = getFlag(p.part_name_ar)
                      const origPrice = basePartPrice(p.part_name_ar)
                      const isAdded   = workshopBase !== null && origPrice === undefined
                      const insComment  = claim.insurance_part_comments?.find(c => c.part_name_ar === p.part_name_ar)?.comment
                      const wsReply     = claim.workshop_part_comments?.[p.part_name_ar]
                      const colSpanAll  = mode === 'negotiate' ? 5 : 4
                      return (
                        <React.Fragment key={i}>
                          <tr style={{ borderBottom: (showPartComment[p.part_name_ar] || insComment || wsReply) ? 'none' : '1px solid #f3f4f6', background: flag ? '#fffdf0' : isAdded ? '#f0fdf4' : 'white' }}>
                            <td style={{ ...td, textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>{i + 1}</td>
                            <td style={{ ...td, fontWeight: 600, color: '#111827' }}>
                              {p.part_name_ar}
                              {isAdded && <AddedBadge />}
                            </td>
                            <td style={td}>{flag && <FlagBadge type={flag} />}</td>
                            <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#1e3a8a' }}>
                              <PriceChange base={origPrice} curr={p.price} />
                            </td>
                            {mode === 'negotiate' && (
                              <td style={{ ...td, textAlign: 'center' }}>
                                <CommentBtn
                                  show={!!showPartComment[p.part_name_ar]}
                                  onToggle={() => setShowPartComment(prev => ({ ...prev, [p.part_name_ar]: !prev[p.part_name_ar] }))}
                                />
                              </td>
                            )}
                          </tr>
                          {mode === 'negotiate' && showPartComment[p.part_name_ar] && (
                            <tr style={{ background: '#f0f9ff', borderBottom: (insComment || wsReply) ? 'none' : '1px solid #f3f4f6' }}>
                              <td colSpan={colSpanAll} style={{ padding: '0.5rem 1rem 0.7rem' }}>
                                <input
                                  type="text"
                                  placeholder="أضف ملاحظة على هذه القطعة..."
                                  value={partComments[p.part_name_ar] || ''}
                                  onChange={e => setPartComments(prev => ({ ...prev, [p.part_name_ar]: e.target.value }))}
                                  style={{ width: '100%', padding: '0.4rem 0.75rem', border: '1.5px solid #93c5fd', borderRadius: '0.375rem', fontSize: '0.85rem', textAlign: 'right', boxSizing: 'border-box' }}
                                />
                              </td>
                            </tr>
                          )}
                          {insComment && (
                            <tr style={{ background: '#fffbeb', borderBottom: wsReply ? 'none' : '1px solid #f3f4f6' }}>
                              <td colSpan={colSpanAll} style={{ padding: '0.35rem 1rem 0.5rem', fontSize: '0.8rem', color: '#92400e' }}>
                                💬 <strong>ملاحظة التأمين:</strong> {insComment}
                              </td>
                            </tr>
                          )}
                          {wsReply && (
                            <tr style={{ background: '#f0fdf4', borderBottom: '1px solid #f3f4f6' }}>
                              <td colSpan={colSpanAll} style={{ padding: '0.35rem 1rem 0.5rem', fontSize: '0.8rem', color: '#065f46' }}>
                                💬 <strong>رد الورشة:</strong> {wsReply}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                    {removedParts.map((p, i) => (
                      <tr key={`removed_part_${i}`} style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                        <td style={{ ...td, textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>—</td>
                        <td style={{ ...td, color: '#9ca3af', textDecoration: 'line-through' }}>
                          {p.part_name_ar} <RemovedBadge />
                        </td>
                        <td style={td} />
                        <td style={{ ...td, textAlign: 'center', color: '#9ca3af', textDecoration: 'line-through' }}>{p.price.toLocaleString()}</td>
                        {mode === 'negotiate' && <td />}
                      </tr>
                    ))}
                    <tr style={{ background: '#f3f4f6', borderTop: '2px solid #1e3a8a' }}>
                      <td colSpan={mode === 'negotiate' ? 4 : 3} style={{ ...td, fontWeight: 700, color: '#1e3a8a' }}>إجمالى قطع الغيار</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: '#1e3a8a' }}>{pd.total_parts.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ── 2. وصف الأعمال (repair + replace, flagged by type) ── */}
            {((pd.repair_groups?.length ?? 0) > 0 || (pd.replace_groups?.length ?? 0) > 0) && (() => {
              const totalLabor = (pd.total_repair || 0) + (pd.total_replace_labor || 0)

              // Build map: labor_name_ar → { repair, replace }
              const laborMap = new Map<string, { repair: LaborGroup | null; replace: LaborGroup | null }>()
              ;(pd.repair_groups || []).forEach(g => {
                const e = laborMap.get(g.labor_name_ar) || { repair: null, replace: null }
                laborMap.set(g.labor_name_ar, { ...e, repair: g })
              })
              ;(pd.replace_groups || []).forEach(g => {
                const e = laborMap.get(g.labor_name_ar) || { repair: null, replace: null }
                laborMap.set(g.labor_name_ar, { ...e, replace: g })
              })
              const laborEntries = Array.from(laborMap.entries())

              const RepairBadge = () => (
                <span style={{ display: 'inline-block', marginRight: '0.4rem', padding: '1px 7px', background: '#f0fdf4', border: '1px solid #16a34a', borderRadius: '999px', color: '#15803d', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>إصلاح</span>
              )
              const ReplaceBadge = () => (
                <span style={{ display: 'inline-block', marginRight: '0.4rem', padding: '1px 7px', background: '#fff1f2', border: '1px solid #e11d48', borderRadius: '999px', color: '#be123c', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>تغيير</span>
              )

              if (mode === 'negotiate') {
                const combinedTotal = totalLabor
                return (
                  <div style={{ background: 'white', borderRadius: '0.75rem', marginBottom: '1.25rem', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <div style={{ padding: '0.85rem 1.25rem', background: '#f5f3ff', borderBottom: '2px solid #7c3aed', fontWeight: 700, color: '#5b21b6' }}>وصف الأعمال</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ ...thBase, borderColor: '#ddd6fe', width: '210px' }}>العمل</th>
                          <th style={{ ...thBase, borderColor: '#ddd6fe' }}>القطع</th>
                          <th style={{ ...thBase, borderColor: '#ddd6fe', textAlign: 'center', width: '160px' }}>التكلفة (ج.م)</th>
                          <th style={{ ...thBase, borderColor: '#ddd6fe', width: '55px', textAlign: 'center' }}>ملاحظة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laborEntries.map(([name, { repair, replace }], i) => {
                          const hasBoth = !!repair && !!replace
                          const rows = [
                            repair  ? { g: repair,  key: `repair_${name}`,  color: '#059669', rowBg: '#f0fdf4', Badge: RepairBadge  } : null,
                            replace ? { g: replace, key: `replace_${name}`, color: '#e11d48', rowBg: '#fff1f2', Badge: ReplaceBadge } : null,
                          ].filter(Boolean) as { g: LaborGroup; key: string; color: string; rowBg: string; Badge: () => JSX.Element }[]

                          return (
                            <React.Fragment key={i}>
                              {rows.map(({ g, key, color, rowBg, Badge }, ri) => (
                                <React.Fragment key={key}>
                                  <tr style={{ borderBottom: showLaborComment[key] ? 'none' : hasBoth && ri === 0 ? 'none' : '1px solid #f3f4f6', verticalAlign: 'top' }}>
                                    <td style={{ ...td, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
                                      {ri === 0 ? name : ''}
                                      <br style={{ display: ri === 0 ? 'none' : undefined }} />
                                      <Badge />
                                    </td>
                                    <td style={{ ...td, color: '#374151', lineHeight: '1.7' }}>{g.parts.length > 0 ? g.parts.join('، ') : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color }}>{g.total.toLocaleString()}</td>
                                    <td style={{ ...td, textAlign: 'center' }}>
                                      <CommentBtn
                                        show={!!showLaborComment[key]}
                                        onToggle={() => setShowLaborComment(prev => ({ ...prev, [key]: !prev[key] }))}
                                      />
                                    </td>
                                  </tr>
                                  {showLaborComment[key] && (
                                    <tr style={{ background: rowBg, borderBottom: '1px solid #f3f4f6' }}>
                                      <td colSpan={4} style={{ padding: '0.5rem 1rem 0.7rem' }}>
                                        <input
                                          type="text"
                                          placeholder="أضف ملاحظة على هذا العمل..."
                                          value={laborComments[key] || ''}
                                          onChange={e => setLaborComments(prev => ({ ...prev, [key]: e.target.value }))}
                                          style={{ width: '100%', padding: '0.4rem 0.75rem', border: '1.5px solid #c4b5fd', borderRadius: '0.375rem', fontSize: '0.85rem', textAlign: 'right', boxSizing: 'border-box' }}
                                        />
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              ))}
                              {hasBoth && (
                                <tr style={{ background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>
                                  <td colSpan={2} style={{ ...td, fontSize: '0.8rem', color: '#7c3aed', fontWeight: 600, paddingRight: '2.5rem' }}>مجموع {name}</td>
                                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>
                                    {(repair!.total + replace!.total).toLocaleString()}
                                  </td>
                                  <td />
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                        <tr style={{ background: '#f5f3ff', borderTop: '2px solid #7c3aed' }}>
                          <td colSpan={2} style={{ ...td, fontWeight: 700, color: '#5b21b6' }}>إجمالى الأعمال</td>
                          <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: '#7c3aed' }}>{combinedTotal.toLocaleString()}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )
              }

              // View mode: sub-rows per type with flags, merged name for dual rows
              return (
                <div style={{ background: 'white', borderRadius: '0.75rem', marginBottom: '1.25rem', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                  <div style={{ padding: '0.85rem 1.25rem', background: '#f5f3ff', borderBottom: '2px solid #7c3aed', fontWeight: 700, color: '#5b21b6' }}>وصف الأعمال</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ ...thBase, borderColor: '#ddd6fe', width: '210px' }}>العمل</th>
                        <th style={{ ...thBase, borderColor: '#ddd6fe' }}>القطع</th>
                        <th style={{ ...thBase, borderColor: '#ddd6fe', textAlign: 'center', width: '140px' }}>التكلفة (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laborEntries.map(([name, { repair, replace }], i) => {
                        const hasBoth = !!repair && !!replace
                        const combined = (repair?.total || 0) + (replace?.total || 0)
                        return (
                          <React.Fragment key={i}>
                            {repair && (
                              <>
                                <tr style={{ borderBottom: (repair.comment || claim.workshop_labor_comments?.[`repair_${name}`]) ? 'none' : hasBoth ? 'none' : '1px solid #f5f3ff', verticalAlign: 'top', background: workshopBase && baseRepairTotal(name) === undefined ? '#f0fdf4' : 'white' }}>
                                  <td style={{ ...td, fontWeight: 700, color: '#5b21b6', whiteSpace: 'nowrap' }}>
                                    {name} <RepairBadge />
                                    {workshopBase && baseRepairTotal(name) === undefined && <AddedBadge />}
                                  </td>
                                  <td style={{ ...td, lineHeight: '1.7' }}>
                                    {repair.parts.length > 0
                                      ? <span style={{ color: '#374151' }}>{repair.parts.join('، ')}</span>
                                      : <span style={{ color: '#9ca3af' }}>—</span>}
                                    {(removedLaborPartsMap[`repair_${name}`] || []).map((p, pi) => (
                                      <span key={pi} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginRight: '0.3rem' }}>
                                        <span style={{ color: '#9ca3af', textDecoration: 'line-through', fontSize: '0.82rem' }}>{p}</span>
                                        <span style={{ padding: '0px 5px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '999px', color: '#dc2626', fontSize: '0.62rem', fontWeight: 700, whiteSpace: 'nowrap' }}>محذوف</span>
                                      </span>
                                    ))}
                                  </td>
                                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#059669' }}>
                                    <PriceChange base={baseRepairTotal(name)} curr={repair.total} />
                                  </td>
                                </tr>
                                {repair.comment && (
                                  <tr style={{ background: '#fffbeb', borderBottom: claim.workshop_labor_comments?.[`repair_${name}`] ? 'none' : hasBoth ? 'none' : '1px solid #f5f3ff' }}>
                                    <td colSpan={3} style={{ padding: '0.35rem 1rem 0.5rem', fontSize: '0.8rem', color: '#92400e' }}>
                                      💬 <strong>ملاحظة التأمين:</strong> {repair.comment}
                                    </td>
                                  </tr>
                                )}
                                {claim.workshop_labor_comments?.[`repair_${name}`] && (
                                  <tr style={{ background: '#f0fdf4', borderBottom: hasBoth ? 'none' : '1px solid #f5f3ff' }}>
                                    <td colSpan={3} style={{ padding: '0.35rem 1rem 0.5rem', fontSize: '0.8rem', color: '#065f46' }}>
                                      💬 <strong>رد الورشة:</strong> {claim.workshop_labor_comments[`repair_${name}`]}
                                    </td>
                                  </tr>
                                )}
                              </>
                            )}
                            {replace && (
                              <>
                                <tr style={{ borderBottom: (replace.comment || claim.workshop_labor_comments?.[`replace_${name}`]) ? 'none' : hasBoth ? '2px solid #ede9fe' : '1px solid #f5f3ff', verticalAlign: 'top', background: workshopBase && baseReplaceTotal(name) === undefined ? '#f0fdf4' : hasBoth ? '#fafafa' : 'white' }}>
                                  <td style={{ ...td, fontWeight: 700, color: '#5b21b6', whiteSpace: 'nowrap', paddingRight: hasBoth ? '1.75rem' : undefined }}>
                                    {hasBoth ? '' : `${name} `}<ReplaceBadge />
                                    {workshopBase && baseReplaceTotal(name) === undefined && <AddedBadge />}
                                  </td>
                                  <td style={{ ...td, lineHeight: '1.7' }}>
                                    {replace.parts.length > 0
                                      ? <span style={{ color: '#374151' }}>{replace.parts.join('، ')}</span>
                                      : <span style={{ color: '#9ca3af' }}>—</span>}
                                    {(removedLaborPartsMap[`replace_${name}`] || []).map((p, pi) => (
                                      <span key={pi} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginRight: '0.3rem' }}>
                                        <span style={{ color: '#9ca3af', textDecoration: 'line-through', fontSize: '0.82rem' }}>{p}</span>
                                        <span style={{ padding: '0px 5px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '999px', color: '#dc2626', fontSize: '0.62rem', fontWeight: 700, whiteSpace: 'nowrap' }}>محذوف</span>
                                      </span>
                                    ))}
                                  </td>
                                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#e11d48' }}>
                                    <PriceChange base={baseReplaceTotal(name)} curr={replace.total} />
                                  </td>
                                </tr>
                                {replace.comment && (
                                  <tr style={{ background: '#fffbeb', borderBottom: claim.workshop_labor_comments?.[`replace_${name}`] ? 'none' : hasBoth ? '2px solid #ede9fe' : '1px solid #f5f3ff' }}>
                                    <td colSpan={3} style={{ padding: '0.35rem 1rem 0.5rem', fontSize: '0.8rem', color: '#92400e' }}>
                                      💬 <strong>ملاحظة التأمين:</strong> {replace.comment}
                                    </td>
                                  </tr>
                                )}
                                {claim.workshop_labor_comments?.[`replace_${name}`] && (
                                  <tr style={{ background: '#f0fdf4', borderBottom: hasBoth ? '2px solid #ede9fe' : '1px solid #f5f3ff' }}>
                                    <td colSpan={3} style={{ padding: '0.35rem 1rem 0.5rem', fontSize: '0.8rem', color: '#065f46' }}>
                                      💬 <strong>رد الورشة:</strong> {claim.workshop_labor_comments[`replace_${name}`]}
                                    </td>
                                  </tr>
                                )}
                              </>
                            )}
                            {hasBoth && (
                              <tr style={{ background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>
                                <td colSpan={2} style={{ ...td, fontSize: '0.8rem', color: '#7c3aed', fontWeight: 600, paddingRight: '2.5rem' }}>مجموع {name}</td>
                                <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>{combined.toLocaleString()}</td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                      {removedRepair.map((g, i) => (
                        <tr key={`removed_repair_${i}`} style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', verticalAlign: 'middle' }}>
                          <td style={{ ...td, color: '#9ca3af', textDecoration: 'line-through', whiteSpace: 'nowrap' }}>
                            {g.labor_name_ar} <RepairBadge /> <RemovedBadge />
                          </td>
                          <td style={{ ...td, color: '#9ca3af', textDecoration: 'line-through', fontSize: '0.82rem' }}>{g.parts.join('، ') || '—'}</td>
                          <td style={{ ...td, textAlign: 'center', color: '#9ca3af', textDecoration: 'line-through' }}>{g.total.toLocaleString()}</td>
                        </tr>
                      ))}
                      {removedReplace.map((g, i) => (
                        <tr key={`removed_replace_${i}`} style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', verticalAlign: 'middle' }}>
                          <td style={{ ...td, color: '#9ca3af', textDecoration: 'line-through', whiteSpace: 'nowrap' }}>
                            {g.labor_name_ar} <ReplaceBadge /> <RemovedBadge />
                          </td>
                          <td style={{ ...td, color: '#9ca3af', textDecoration: 'line-through', fontSize: '0.82rem' }}>{g.parts.join('، ') || '—'}</td>
                          <td style={{ ...td, textAlign: 'center', color: '#9ca3af', textDecoration: 'line-through' }}>{g.total.toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr style={{ background: '#f5f3ff', borderTop: '2px solid #7c3aed' }}>
                        <td colSpan={2} style={{ ...td, fontWeight: 700, color: '#5b21b6' }}>إجمالى الأعمال</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: '#7c3aed' }}>{totalLabor.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            })()}

            {/* ── GRAND TOTAL ── */}
            <div style={{ background: '#1e3a8a', borderRadius: '0.75rem', padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'white', fontWeight: 800, fontSize: '1.1rem' }}>
                {pd.grand_total.toLocaleString()} ج.م
              </span>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '0.9rem' }}>إجمالى التكلفة</span>
            </div>
          </>
        ) : (
          /* Fallback for old estimates */
          (() => {
            const replaceParts = claim.estimate_parts?.filter(p => p.severity_label === 'Replace') || []
            const repairParts  = claim.estimate_parts?.filter(p => p.severity_label === 'Repair') || []
            const replaceTotal = replaceParts.reduce((s, p) => s + (p.price || 0), 0)
            const repairTotal  = repairParts.reduce((s, p) => s + (p.price || 0), 0)
            return replaceParts.length + repairParts.length > 0 ? (
              <>
                {replaceParts.length > 0 && (
                  <div style={{ background: 'white', borderRadius: '0.75rem', marginBottom: '1.25rem', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <div style={{ padding: '0.85rem 1.25rem', background: '#f3f4f6', borderBottom: '2px solid #1e3a8a', fontWeight: 700, color: '#1e3a8a' }}>قطع الغيار</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {replaceParts.map((p, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ ...td, textAlign: 'center', color: '#9ca3af', width: '36px' }}>{i + 1}</td>
                            <td style={{ ...td, fontWeight: 600, color: '#111827' }}>{p.part_name_ar}</td>
                            <td style={{ ...td }}>{getFlag(p.part_name_ar) && <FlagBadge type={getFlag(p.part_name_ar)!} />}</td>
                            <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#1e3a8a' }}>{(p.price || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                        <tr style={{ background: '#f3f4f6', borderTop: '2px solid #1e3a8a' }}>
                          <td colSpan={3} style={{ ...td, fontWeight: 700, color: '#1e3a8a' }}>الإجمالى</td>
                          <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: '#1e3a8a' }}>{replaceTotal.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ background: '#1e3a8a', borderRadius: '0.75rem', padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'white', fontWeight: 800, fontSize: '1.1rem' }}>{(replaceTotal + repairTotal).toLocaleString()} ج.م</span>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>إجمالى التكلفة</span>
                </div>
              </>
            ) : (
              <div style={{ background: 'white', borderRadius: '0.75rem', padding: '2rem', textAlign: 'center', color: '#9ca3af', border: '1px dashed #e5e7eb', marginBottom: '1.5rem' }}>
                لا تتوفر بيانات تسعير لهذا التقدير
              </div>
            )
          })()
        )}

        {/* ── ACTION BUTTONS ── */}
        {/* Show buttons if no action yet, OR if workshop has responded (needs insurance final decision) */}
        {(() => {
          const isWithoutCommitment = claim.status === 'confirmed' && claim.insurance_action === 'without_commitment'
          const needsInsuranceAction = !claim.insurance_action
            || isWithoutCommitment
            || claim.status === 'workshop_accepted'
            || claim.status === 'workshop_revised'
            || claim.status === 'counter_offer'

          return (
            <>

              {needsInsuranceAction && (
                <>
                  {/* Reject comment box */}
                  {mode === 'reject' && (
                    <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1rem', border: '1.5px solid #fecaca' }}>
                      <label style={{ display: 'block', fontWeight: 700, color: '#dc2626', marginBottom: '0.6rem', fontSize: '0.9rem' }}>سبب الرفض <span style={{ color: '#dc2626' }}>*</span></label>
                      <textarea
                        rows={3} value={rejectComment} onChange={e => setRejectComment(e.target.value)}
                        placeholder="اذكر سبب الرفض..."
                        style={{ width: '100%', padding: '0.75rem', border: '1.5px solid #fecaca', borderRadius: '0.5rem', fontSize: '0.9rem', textAlign: 'right', resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '1rem' }}>
                    <button onClick={() => openConfirm('approved')}
                      style={{ flex: '1 1 130px', minWidth: '130px', padding: '0.9rem 1rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '0.6rem', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>
                      ✓ موافقة
                    </button>

                    {mode !== 'reject' ? (
                      <button onClick={() => { setMode('reject'); setRejectComment('') }}
                        style={{ flex: '1 1 130px', minWidth: '130px', padding: '0.9rem 1rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '0.6rem', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>
                        ✗ رفض
                      </button>
                    ) : (
                      <div style={{ flex: '1 1 130px', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {!rejectComment.trim() && <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600, textAlign: 'center' }}>* سبب الرفض مطلوب</span>}
                        <button onClick={() => openConfirm('rejected')} disabled={!rejectComment.trim()}
                          style={{ padding: '0.9rem 1rem', background: rejectComment.trim() ? '#dc2626' : '#9ca3af', color: 'white', border: 'none', borderRadius: '0.6rem', fontWeight: 800, fontSize: '0.9rem', cursor: rejectComment.trim() ? 'pointer' : 'not-allowed' }}>
                          تأكيد الرفض
                        </button>
                      </div>
                    )}

                    {mode !== 'negotiate' ? (
                      <button onClick={() => setMode('negotiate')}
                        style={{ flex: '1 1 130px', minWidth: '130px', padding: '0.9rem 1rem', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '0.6rem', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>
                        ✏ تفاوض
                      </button>
                    ) : (
                      <button onClick={() => openConfirm('negotiated')}
                        style={{ flex: '1 1 130px', minWidth: '130px', padding: '0.9rem 1rem', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '0.6rem', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>
                        إرسال العرض
                      </button>
                    )}

                    <button onClick={() => !isWithoutCommitment && openConfirm('without_commitment')}
                      style={{ flex: '1 1 130px', minWidth: '130px', padding: '0.9rem 1rem', background: isWithoutCommitment ? '#f3f4f6' : 'white', color: isWithoutCommitment ? '#d1d5db' : '#6b7280', border: `1.5px solid ${isWithoutCommitment ? '#e5e7eb' : '#d1d5db'}`, borderRadius: '0.6rem', fontWeight: 800, fontSize: '0.9rem', cursor: isWithoutCommitment ? 'default' : 'pointer', opacity: isWithoutCommitment ? 0.5 : 1 }}>
                      {isWithoutCommitment ? '✓ بدون التزام' : 'بدون التزام'}
                    </button>

                    {mode !== 'view' && (
                      <button onClick={() => setMode('view')}
                        style={{ flex: '1 1 80px', padding: '0.9rem 1rem', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '0.6rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                        إلغاء
                      </button>
                    )}
                  </div>
                </>
              )}

            </>
          )
        })()}
      </div>

      {/* ── EXTRA IMAGES POPUP ── */}
      {extraImagesOpen && (
        <>
          <div onClick={() => setExtraImagesOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: '1rem', width: '90%', maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', zIndex: 101, direction: 'rtl', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>🖼 صور إضافية من الورشة</div>
              <button onClick={() => setExtraImagesOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '1rem', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem' }}>
                {visibleExtraImages.map((img, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <img
                      src={img.cloudinary_url} alt=""
                      onClick={() => setLightboxUrl(img.cloudinary_url)}
                      style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', display: 'block' }}
                    />
                    <button
                      onClick={async e => {
                        e.stopPropagation()
                        try { const r = await fetch(img.cloudinary_url); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `workshop-image-${idx + 1}.jpg`; a.click(); URL.revokeObjectURL(a.href) }
                        catch { window.open(img.cloudinary_url, '_blank') }
                      }}
                      style={{ position: 'absolute', bottom: '5px', left: '5px', backgroundColor: 'rgba(0,0,0,0.55)', color: 'white', border: 'none', borderRadius: '5px', padding: '3px 6px', fontSize: '0.75rem', cursor: 'pointer' }}
                    >⬇</button>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => visibleExtraImages.forEach(async (img, idx) => {
                  try { const r = await fetch(img.cloudinary_url); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `workshop-image-${idx + 1}.jpg`; a.click(); URL.revokeObjectURL(a.href) }
                  catch { window.open(img.cloudinary_url, '_blank') }
                })}
                style={{ padding: '0.65rem 1.75rem', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '0.6rem', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}
              >⬇ تحميل الكل</button>
            </div>
          </div>
        </>
      )}

      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightboxUrl} alt="" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: '8px', objectFit: 'contain' }} />
        </div>
      )}

      {/* ── CONFIRMATION DIALOG ── */}
      {confirmDialog && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '2rem', maxWidth: '400px', width: '90%', direction: 'rtl', textAlign: 'right', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>{confirmDialog.title}</h3>
            <p style={{ margin: '0 0 1.5rem', color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{confirmDialog.body}</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => submit(confirmDialog.action)} disabled={submitting}
                style={{ flex: 1, padding: '0.75rem', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.95rem' }}>
                {submitting ? '...' : 'تأكيد'}
              </button>
              <button onClick={() => setConfirmDialog(null)} disabled={submitting}
                style={{ flex: 1, padding: '0.75rem', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '0.5rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

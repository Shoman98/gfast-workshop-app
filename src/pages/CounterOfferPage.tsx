import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
const LABOR_TYPES = [
  { key: 'refitting_labor_hrs', nameAr: 'اعمال فك و تركيب' },
  { key: 'dent_hrs',            nameAr: 'اعمال سمكره' },
  { key: 'paint_hrs',           nameAr: 'اعمال دهان' },
  { key: 'elec_hrs',            nameAr: 'اعمال كهربا' },
  { key: 'intr_hrs',            nameAr: 'اعمال سروجي' },
  { key: 'cooling_hrs',         nameAr: 'اعمال تبريد' },
  { key: 'susp_hrs',            nameAr: 'اعمال عفشه و زوايا' },
  { key: 'mechanical_hrs',      nameAr: 'اعمال ميكانيكا' },
  { key: 'glass_hrs',           nameAr: 'اعمال زجاج' },
]

interface PartRow   { part_name_ar: string; price: number }
interface LaborRow  { labor_name_ar: string; total: number; parts: string[] }
interface PricingData {
  part_prices: PartRow[]
  repair_groups: LaborRow[]
  replace_groups: LaborRow[]
  total_parts: number
  total_repair: number
  total_replace_labor: number
  grand_total: number
}
interface EstimateData {
  estimate_id: string
  vehicle_make: string
  vehicle_model: string
  vehicle_year: number
  status: string
  pricing_data?: PricingData
  insurance_negotiated_pricing?: PricingData
}

const sectionHeader = (title: string, bg: string, border: string, color: string) => (
  <div style={{ padding: '0.85rem 1.25rem', background: bg, borderBottom: `2px solid ${border}`, fontWeight: 700, color }}>{title}</div>
)

const LaborTable = ({
  type, groups, setGroups, usedLabors,
  headerBg, headerBorder, headerColor,
  totalColor, totalBg, totalBorder,
  newLaborVal, setNewLaborVal,
  pendingLaborPart, setPendingLaborPart,
  addLaborPartRow, addLaborGroup,
}: {
  type: 'repair' | 'replace'
  groups: LaborRow[]
  setGroups: React.Dispatch<React.SetStateAction<LaborRow[]>>
  usedLabors: Set<string>
  headerBg: string; headerBorder: string; headerColor: string
  totalColor: string; totalBg: string; totalBorder: string
  newLaborVal: string
  setNewLaborVal: (v: string) => void
  pendingLaborPart: Record<string, string>
  setPendingLaborPart: React.Dispatch<React.SetStateAction<Record<string, string>>>
  addLaborPartRow: (type: 'repair' | 'replace', laborName: string) => void
  addLaborGroup: (type: 'repair' | 'replace') => void
}) => {
  const title = type === 'repair' ? 'وصف الأعمال — الإصلاح' : 'وصف الأعمال — التغيير'
  const availableLabors = LABOR_TYPES.filter(lt => !usedLabors.has(lt.nameAr))
  const total = groups.reduce((s, g) => s + (g.total || 0), 0)

  return (
    <div style={{ background: 'white', borderRadius: '0.75rem', marginBottom: '1.25rem', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      {sectionHeader(title, headerBg, headerBorder, headerColor)}

      {groups.map((g, gi) => {
        const key = `${type}_${g.labor_name_ar}`
        return (
          <div key={gi} style={{ borderBottom: `1px solid ${totalBorder}` }}>
            {/* Labor row header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', background: `${headerBg}88` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="number" min="0"
                  value={g.total || ''}
                  placeholder="0"
                  onChange={e => setGroups(prev => prev.map((gr, i) => i === gi ? { ...gr, total: Math.max(0, parseFloat(e.target.value) || 0) } : gr))}
                  style={{ width: '100px', padding: '0.3rem 0.5rem', border: `1.5px solid ${headerBorder}`, borderRadius: '0.375rem', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', direction: 'ltr', color: headerColor }}
                />
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>ج.م</span>
                <button
                  onClick={() => setGroups(prev => prev.filter((_, i) => i !== gi))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.8rem', padding: '0 4px' }}
                >✕</button>
              </div>
              <span style={{ fontWeight: 700, color: headerColor, fontSize: '0.9rem' }}>{g.labor_name_ar}</span>
            </div>

            {/* Parts under this labor */}
            <div style={{ padding: '0.4rem 1rem 0.6rem', background: 'white' }}>
              {g.parts.map((part, pi) => (
                <div key={pi} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.2rem 0', fontSize: '0.82rem', color: '#374151' }}>
                  <button
                    onClick={() => setGroups(prev => prev.map((gr, i) => i === gi ? { ...gr, parts: gr.parts.filter((_, j) => j !== pi) } : gr))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.72rem', padding: '0 2px' }}
                  >✕</button>
                  <span>{part}</span>
                </div>
              ))}

              {/* Add part to labor */}
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: `1px dashed ${totalBorder}` }}>
                <button
                  onClick={() => addLaborPartRow(type, g.labor_name_ar)}
                  disabled={!pendingLaborPart[key]}
                  style={{ padding: '0.2rem 0.5rem', backgroundColor: pendingLaborPart[key] ? headerColor : '#9ca3af', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.75rem', cursor: pendingLaborPart[key] ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                >➕</button>
                <input
                  type="text"
                  value={pendingLaborPart[key] || ''}
                  onChange={e => setPendingLaborPart(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="اسم القطعة"
                  style={{ flex: 1, padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.78rem', textAlign: 'right' }}
                />
              </div>
            </div>
          </div>
        )
      })}

      {/* Add labor group */}
      {availableLabors.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', alignItems: 'center', background: '#fafafa', borderTop: '1px solid #e5e7eb' }}>
          <button
            onClick={() => addLaborGroup(type)}
            disabled={!newLaborVal}
            style={{ padding: '0.35rem 0.9rem', backgroundColor: newLaborVal ? headerColor : '#9ca3af', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.8rem', fontWeight: 700, cursor: newLaborVal ? 'pointer' : 'not-allowed', flexShrink: 0 }}
          >+ إضافة عمل</button>
          <select
            value={newLaborVal}
            onChange={e => setNewLaborVal(e.target.value)}
            style={{ flex: 1, padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8rem', textAlign: 'right', direction: 'rtl' }}
          >
            <option value="">-- اختر نوع العمل --</option>
            {availableLabors.map(lt => <option key={lt.key} value={lt.nameAr}>{lt.nameAr}</option>)}
          </select>
        </div>
      )}

      {/* Section total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: totalBg, borderTop: `2px solid ${totalBorder}`, fontWeight: 700 }}>
        <span style={{ color: totalColor }}>{total.toLocaleString()} ج.م</span>
        <span style={{ color: totalColor }}>إجمالى {type === 'repair' ? 'الإصلاح' : 'التغيير'}</span>
      </div>
    </div>
  )
}

export default function CounterOfferPage() {
  const { estimateId } = useParams()
  const navigate = useNavigate()

  const [estimate, setEstimate]   = useState<EstimateData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Replace parts
  const [replaceParts, setReplaceParts] = useState<PartRow[]>([])
  const [newPartQuery, setNewPartQuery] = useState('')
  const [newPartPrice, setNewPartPrice] = useState('')

  // Labor groups
  const [repairGroups, setRepairGroups]   = useState<LaborRow[]>([])
  const [replaceGroups, setReplaceGroups] = useState<LaborRow[]>([])

  // Adding parts to labor groups
  const [pendingLaborPart, setPendingLaborPart] = useState<Record<string, string>>({})

  // Adding new labor groups
  const [newLaborRepair, setNewLaborRepair]   = useState('')
  const [newLaborReplace, setNewLaborReplace] = useState('')

  useEffect(() => { load() }, [estimateId])

  const load = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/api/estimates/${estimateId}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('فشل تحميل التقدير')
      const data = await res.json()
      const est: EstimateData = data.estimate
      setEstimate(est)

      // Load insurance's negotiated prices if available, otherwise fall back to original pricing_data
      const source = est.insurance_negotiated_pricing || est.pricing_data
      if (source) {
        setReplaceParts(source.part_prices?.map(p => ({ ...p })) || [])
        setRepairGroups(source.repair_groups?.map(g => ({ ...g, parts: [...g.parts] })) || [])
        setReplaceGroups(source.replace_groups?.map(g => ({ ...g, parts: [...g.parts] })) || [])
      }
    } catch (e) { setError((e as Error).message) }
    finally     { setLoading(false) }
  }

  // Totals
  const totalParts   = replaceParts.reduce((s, p) => s + (p.price || 0), 0)
  const totalRepair  = repairGroups.reduce((s, g) => s + (g.total || 0), 0)
  const totalReplace = replaceGroups.reduce((s, g) => s + (g.total || 0), 0)
  const grandTotal   = totalParts + totalRepair + totalReplace

  const addReplacePart = (name: string) => {
    if (!name.trim()) return
    const exists = replaceParts.some(p => p.part_name_ar === name.trim())
    if (exists) return
    setReplaceParts(prev => [...prev, { part_name_ar: name.trim(), price: parseFloat(newPartPrice) || 0 }])
    setNewPartQuery('')
    setNewPartPrice('')
    setShowPartDrop(false)
  }

  const addLaborPartRow = (type: 'repair' | 'replace', laborName: string) => {
    const key = `${type}_${laborName}`
    const partName = pendingLaborPart[key]?.trim()
    if (!partName) return
    const setter = type === 'repair' ? setRepairGroups : setReplaceGroups
    setter(prev => prev.map(g =>
      g.labor_name_ar === laborName && !g.parts.includes(partName)
        ? { ...g, parts: [...g.parts, partName] }
        : g
    ))
    setPendingLaborPart(prev => ({ ...prev, [key]: '' }))
  }

  const addLaborGroup = (type: 'repair' | 'replace') => {
    const name = type === 'repair' ? newLaborRepair : newLaborReplace
    if (!name) return
    const setter = type === 'repair' ? setRepairGroups : setReplaceGroups
    const exists = (type === 'repair' ? repairGroups : replaceGroups).some(g => g.labor_name_ar === name)
    if (!exists) setter(prev => [...prev, { labor_name_ar: name, total: 0, parts: [] }])
    if (type === 'repair') { setNewLaborRepair('') } else { setNewLaborReplace('') }
  }

  const usedRepairLabors  = new Set(repairGroups.map(g => g.labor_name_ar))
  const usedReplaceLabors = new Set(replaceGroups.map(g => g.labor_name_ar))

  const submit = async () => {
    if (!estimate) return
    setSubmitting(true)
    try {
      const counterOfferPricingData: PricingData = {
        part_prices: replaceParts,
        repair_groups: repairGroups,
        replace_groups: replaceGroups,
        total_parts: totalParts,
        total_repair: totalRepair,
        total_replace_labor: totalReplace,
        grand_total: grandTotal,
      }
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/api/estimates/${estimateId}/negotiate-revision`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workshop_counter_offer_pricing: counterOfferPricingData }),
      })
      if (!res.ok) throw new Error('فشل إرسال العرض المضاد')
      navigate('/dashboard')
    } catch (e) { setError((e as Error).message) }
    finally     { setSubmitting(false); setShowConfirm(false) }
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>⏳ جاري التحميل...</div>
  if (error)   return <div style={{ padding: '3rem', textAlign: 'center', color: '#dc2626' }}>{error}</div>
  if (!estimate) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '1.5rem 1rem', direction: 'rtl' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.25rem 1.5rem', marginBottom: '1.25rem', border: '1px solid #e5e7eb' }}>
          <button onClick={() => navigate(`/estimate/${estimateId}/negotiate`)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem', padding: 0 }}>
            ← العودة لعرض التأمين
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.3rem', fontWeight: 800, color: '#111827' }}>
                {estimate.vehicle_make} {estimate.vehicle_model} {estimate.vehicle_year}
              </h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>تحرير العرض المضاد — سيُرسل للتأمين عند التأكيد</p>
            </div>
            <span style={{ padding: '0.35rem 1rem', borderRadius: '999px', background: '#eff6ff', border: '1.5px solid #2563eb', color: '#1d4ed8', fontWeight: 700, fontSize: '0.82rem' }}>
              🔄 عرض مضاد
            </span>
          </div>
        </div>

        {/* ── قطع الغيار ── */}
        <div style={{ background: 'white', borderRadius: '0.75rem', marginBottom: '1.25rem', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          {sectionHeader('قطع الغيار', '#f3f4f6', '#1e3a8a', '#1e3a8a')}

          {replaceParts.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: '1px solid #f9fafb', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="number" min="0"
                  value={p.price || ''}
                  placeholder="0"
                  onChange={e => setReplaceParts(prev => prev.map((pp, j) => j === i ? { ...pp, price: Math.max(0, parseFloat(e.target.value) || 0) } : pp))}
                  style={{ width: '100px', padding: '0.3rem 0.5rem', border: '1.5px solid #bfdbfe', borderRadius: '0.375rem', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', direction: 'ltr', color: '#1e3a8a' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>ج.م</span>
                <button
                  onClick={() => setReplaceParts(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.8rem' }}
                >✕</button>
              </div>
              <span style={{ fontWeight: 600, color: '#111827' }}>{p.part_name_ar}</span>
            </div>
          ))}

          {/* Add replace part */}
          <div style={{ padding: '0.75rem 1rem', background: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={newPartQuery}
                onChange={e => setNewPartQuery(e.target.value)}
                placeholder="اسم القطعة"
                style={{ flex: 2, minWidth: '160px', padding: '0.5rem 0.75rem', border: '1.5px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.85rem', textAlign: 'right', boxSizing: 'border-box' }}
              />
              <input
                type="number" min="0"
                value={newPartPrice}
                onChange={e => setNewPartPrice(e.target.value)}
                placeholder="السعر"
                style={{ width: '100px', padding: '0.5rem', border: '1.5px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.85rem', textAlign: 'center', direction: 'ltr' }}
              />
              <button
                onClick={() => addReplacePart(newPartQuery)}
                disabled={!newPartQuery.trim()}
                style={{ padding: '0.5rem 1rem', backgroundColor: newPartQuery.trim() ? '#1e3a8a' : '#9ca3af', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 700, fontSize: '0.85rem', cursor: newPartQuery.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
              >➕ إضافة قطعة</button>
            </div>
          </div>

          {/* Parts total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', background: '#f3f4f6', borderTop: '2px solid #1e3a8a', fontWeight: 700 }}>
            <span style={{ color: '#1e3a8a' }}>{totalParts.toLocaleString()} ج.م</span>
            <span style={{ color: '#1e3a8a' }}>إجمالى قطع الغيار</span>
          </div>
        </div>

        {/* ── Repair labor ── */}
        <LaborTable
          type="repair" groups={repairGroups} setGroups={setRepairGroups} usedLabors={usedRepairLabors}
          headerBg="#f0fdf4" headerBorder="#16a34a" headerColor="#065f46"
          totalBg="#f0fdf4" totalBorder="#d1fae5" totalColor="#059669"
          newLaborVal={newLaborRepair} setNewLaborVal={setNewLaborRepair}
          pendingLaborPart={pendingLaborPart} setPendingLaborPart={setPendingLaborPart}
          addLaborPartRow={addLaborPartRow} addLaborGroup={addLaborGroup}
        />

        {/* ── Replace labor ── */}
        <LaborTable
          type="replace" groups={replaceGroups} setGroups={setReplaceGroups} usedLabors={usedReplaceLabors}
          headerBg="#fff1f2" headerBorder="#e11d48" headerColor="#9f1239"
          totalBg="#fff1f2" totalBorder="#fecdd3" totalColor="#e11d48"
          newLaborVal={newLaborReplace} setNewLaborVal={setNewLaborReplace}
          pendingLaborPart={pendingLaborPart} setPendingLaborPart={setPendingLaborPart}
          addLaborPartRow={addLaborPartRow} addLaborGroup={addLaborGroup}
        />

        {/* Grand total */}
        <div style={{ background: '#1e3a8a', borderRadius: '0.75rem', padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontWeight: 800, fontSize: '1.15rem' }}>{grandTotal.toLocaleString()} ج.م</span>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '0.9rem' }}>إجمالى العرض المضاد</span>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setShowConfirm(true)}
            style={{ flex: 1, padding: '1rem', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '0.6rem', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}
          >
            ✅ إرسال العرض المضاد للتأمين
          </button>
          <button
            onClick={() => navigate(`/estimate/${estimateId}/negotiate`)}
            style={{ padding: '1rem 1.5rem', background: 'white', color: '#6b7280', border: '1.5px solid #d1d5db', borderRadius: '0.6rem', fontWeight: 700, cursor: 'pointer' }}
          >إلغاء</button>
        </div>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '2rem', maxWidth: '400px', width: '90%', direction: 'rtl', textAlign: 'right', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>تأكيد إرسال العرض المضاد</h3>
            <p style={{ margin: '0 0 0.5rem', color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.6 }}>سيتم إرسال العرض المضاد للتأمين بإجمالي:</p>
            <p style={{ margin: '0 0 1rem', color: '#1e3a8a', fontWeight: 800, fontSize: '1.2rem' }}>{grandTotal.toLocaleString()} ج.م</p>
            <p style={{ margin: '0 0 1.5rem', color: '#6b7280', fontSize: '0.85rem' }}>سيظهر للتأمين تحت نفس رقم التقدير للمراجعة.</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={submit} disabled={submitting}
                style={{ flex: 1, padding: '0.75rem', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.95rem' }}>
                {submitting ? '...' : 'إرسال'}
              </button>
              <button onClick={() => setShowConfirm(false)}
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

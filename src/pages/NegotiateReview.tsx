import { useState, useEffect, Fragment, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import partsDb from '@/data/parts.json'

const PARTS_LIST: { partId: string; nameAr: string; nameEn: string }[] = partsDb

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

interface LaborGroup { labor_name_ar: string; total: number; parts: string[]; comment?: string | null }
interface PartPrice  { part_name_ar: string; price: number }
interface PricingData {
  repair_groups: LaborGroup[]
  replace_groups: LaborGroup[]
  part_prices: PartPrice[]
  total_repair: number
  total_replace_labor: number
  total_parts: number
  grand_total: number
}
interface PartComment { part_name_ar: string; comment: string }
interface ExtraImage  { id: string; cloudinary_url: string; pending?: boolean }
interface EstimateData {
  estimate_id: string
  vehicle_make: string; vehicle_model: string; vehicle_year: number
  status: string
  pricing_data?: PricingData
  insurance_negotiated_pricing?: PricingData
  workshop_counter_offer_pricing?: PricingData
  insurance_part_comments?: PartComment[]
  insurance_comment?: string
  workshop_labor_comments?: Record<string, string>
  workshop_part_comments?: Record<string, string>
  extra_images_by_workshop?: ExtraImage[]
}

// Before/after badge for changed values
function BeforeTag({ orig, curr }: { orig: number | undefined; curr: number }) {
  if (orig === undefined) return <span style={{ marginRight: '0.3rem', padding: '1px 6px', background: '#f0fdf4', border: '1px solid #16a34a', borderRadius: '999px', color: '#15803d', fontSize: '0.68rem', fontWeight: 700 }}>مضاف</span>
  if (orig === curr) return null
  return <span style={{ marginRight: '0.3rem', color: '#9ca3af', fontSize: '0.75rem', textDecoration: 'line-through' }}>{orig.toLocaleString()}</span>
}

const RepairBadge = () => <span style={{ display: 'inline-block', marginRight: '0.35rem', padding: '1px 7px', background: '#f0fdf4', border: '1px solid #16a34a', borderRadius: '999px', color: '#15803d', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>إصلاح</span>
const ReplaceBadge = () => <span style={{ display: 'inline-block', marginRight: '0.35rem', padding: '1px 7px', background: '#fff1f2', border: '1px solid #e11d48', borderRadius: '999px', color: '#be123c', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>تغيير</span>

// Inline parts autocomplete
function PartAutocomplete({ value, onChange, onSelect, placeholder }: {
  value: string; onChange: (v: string) => void; onSelect: (name: string) => void; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const filtered = value.trim()
    ? PARTS_LIST.filter(p => p.nameAr.includes(value) || p.nameEn.toLowerCase().includes(value.toLowerCase())).slice(0, 30)
    : PARTS_LIST.slice(0, 30)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: '140px' }}>
      <input
        type="text" value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || 'اسم القطعة'}
        style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1.5px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.82rem', textAlign: 'right', boxSizing: 'border-box' }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.375rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: '180px', overflowY: 'auto' }}>
          {filtered.map(p => (
            <div key={p.partId} onClick={() => { onSelect(p.nameAr); onChange(p.nameAr); setOpen(false) }}
              style={{ padding: '0.45rem 0.75rem', cursor: 'pointer', fontSize: '0.82rem', color: '#111827', direction: 'rtl' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f3ff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >{p.nameAr}</div>
          ))}
          {!PARTS_LIST.some(p => p.nameAr === value.trim()) && value.trim() && (
            <div onClick={() => { onSelect(value.trim()); setOpen(false) }}
              style={{ padding: '0.45rem 0.75rem', cursor: 'pointer', fontSize: '0.82rem', color: '#7c3aed', borderTop: '1px solid #f3f4f6' }}>
              ➕ إضافة "{value.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function NegotiateReview() {
  const { estimateId } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [estimate, setEstimate]         = useState<EstimateData | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [showSendDialog, setShowSendDialog] = useState(false)
  const [sending, setSending]           = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null)

  // Editable pricing state
  const [editPartPrices, setEditPartPrices]     = useState<PartPrice[]>([])
  const [editRepairGroups, setEditRepairGroups] = useState<LaborGroup[]>([])
  const [editReplaceGroups, setEditReplaceGroups] = useState<LaborGroup[]>([])

  // Removed items (originally from source, flagged for display)
  const [removedPartNames, setRemovedPartNames]     = useState<string[]>([])
  const [removedRepairNames, setRemovedRepairNames] = useState<string[]>([])
  const [removedReplaceNames, setRemovedReplaceNames] = useState<string[]>([])
  // Removed parts under a labor group — key: `${type}_${laborName}`, value: part names
  const [removedLaborParts, setRemovedLaborParts]   = useState<Record<string, string[]>>({})

  const initialized = useRef(false)
  const draftKey = `gfast_negotiate_draft_${estimateId}`
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, setSyncStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Add new replaceable part
  const [newPartName, setNewPartName]   = useState('')
  const [newPartPrice, setNewPartPrice] = useState('')

  // Add part to a labor group — keyed by `${type}_${laborName}`
  const [pendingLaborPart, setPendingLaborPart] = useState<Record<string, string>>({})

  // Add new labor group
  const [newLaborType, setNewLaborType] = useState<'repair' | 'replace'>('repair')
  const [newLaborName, setNewLaborName] = useState('')

  // Comments
  const [workshopLaborComments, setWorkshopLaborComments] = useState<Record<string, string>>({})
  const [workshopPartComments, setWorkshopPartComments]   = useState<Record<string, string>>({})

  // Extra images
  const [extraImages, setExtraImages]       = useState<ExtraImage[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imagesPopupOpen, setImagesPopupOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [lightboxUrl, setLightboxUrl]       = useState<string | null>(null)

  useEffect(() => {
    load()
    const onFocus = () => { if (initialized.current) load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [estimateId])

  // Auto-save edits to localStorage whenever pricing state changes
  useEffect(() => {
    if (!initialized.current) return
    const draft = { editPartPrices, editRepairGroups, editReplaceGroups, removedPartNames, removedRepairNames, removedReplaceNames, removedLaborParts, savedAt: new Date().toISOString() }
    localStorage.setItem(draftKey, JSON.stringify(draft))
    setDraftSavedAt(new Date())
  }, [editPartPrices, editRepairGroups, editReplaceGroups, removedPartNames, removedRepairNames, removedReplaceNames, removedLaborParts])

  // Debounced auto-save to backend (syncs to insurance page in real-time)
  useEffect(() => {
    if (!initialized.current || !estimateId) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    setSyncStatus('saving')
    autoSaveTimer.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token')
        const totalParts  = editPartPrices.reduce((s, p) => s + (p.price || 0), 0)
        const totalRepair = editRepairGroups.reduce((s, g) => s + (g.total || 0), 0)
        const totalReplace = editReplaceGroups.reduce((s, g) => s + (g.total || 0), 0)
        await fetch(apiUrl(`/api/estimates/${estimateId}/negotiate-draft`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            workshop_counter_offer_pricing: {
              part_prices: editPartPrices,
              repair_groups: editRepairGroups,
              replace_groups: editReplaceGroups,
              total_parts: totalParts,
              total_repair: totalRepair,
              total_replace_labor: totalReplace,
              grand_total: totalParts + totalRepair + totalReplace,
            },
            workshop_labor_comments: workshopLaborComments,
            workshop_part_comments: workshopPartComments,
          }),
        })
        setSyncStatus('saved')
        setTimeout(() => setSyncStatus('idle'), 2000)
      } catch { setSyncStatus('idle') }
    }, 1500)
  }, [editPartPrices, editRepairGroups, editReplaceGroups, workshopLaborComments, workshopPartComments])

  const load = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/api/estimates/${estimateId}`), { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('فشل تحميل التقدير')
      const data = await res.json()
      const est: EstimateData = data.estimate
      setEstimate(est)
      // Prefer previously submitted counter-offer → insurance's offer → original pricing
      const src = est.workshop_counter_offer_pricing || est.insurance_negotiated_pricing || est.pricing_data
      const savedDraft = localStorage.getItem(draftKey)
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft)
          setEditPartPrices(draft.editPartPrices || [])
          setEditRepairGroups(draft.editRepairGroups || [])
          setEditReplaceGroups(draft.editReplaceGroups || [])
          setRemovedPartNames(draft.removedPartNames || [])
          setRemovedRepairNames(draft.removedRepairNames || [])
          setRemovedReplaceNames(draft.removedReplaceNames || [])
          setRemovedLaborParts(draft.removedLaborParts || {})
          setDraftSavedAt(new Date(draft.savedAt))
        } catch {
          localStorage.removeItem(draftKey)
          if (src) {
            setEditPartPrices(src.part_prices?.map(p => ({ ...p })) || [])
            setEditRepairGroups(src.repair_groups?.map(g => ({ ...g, parts: [...g.parts] })) || [])
            setEditReplaceGroups(src.replace_groups?.map(g => ({ ...g, parts: [...g.parts] })) || [])
          }
        }
      } else if (src) {
        setEditPartPrices(src.part_prices?.map(p => ({ ...p })) || [])
        setEditRepairGroups(src.repair_groups?.map(g => ({ ...g, parts: [...g.parts] })) || [])
        setEditReplaceGroups(src.replace_groups?.map(g => ({ ...g, parts: [...g.parts] })) || [])
      }
      setWorkshopLaborComments(est.workshop_labor_comments || {})
      setWorkshopPartComments(est.workshop_part_comments || {})
      setExtraImages(est.extra_images_by_workshop || [])
      initialized.current = true
    } catch (e) { setError((e as Error).message) }
    finally     { setLoading(false) }
  }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const uploadImage = async (file: File) => {
    setUploadingImage(true)
    try {
      // Upload to Cloudinary directly (unsigned preset), same as the estimate flow
      const cloudName    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
      const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
      const cloudForm = new FormData()
      cloudForm.append('file', file)
      cloudForm.append('upload_preset', uploadPreset)
      const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: cloudForm })
      if (!cloudRes.ok) throw new Error('cloudinary')
      const cloud = await cloudRes.json()

      // Persist reference on the estimate (stored with pending:true until sent to insurance)
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/api/estimates/${estimateId}/workshop-extra-images`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cloudinary_url: cloud.secure_url, cloudinary_public_id: cloud.public_id }),
      })
      const d = await res.json()
      if (d.image) {
        setExtraImages(prev => [...prev, d.image])
        showToast('✓ تم رفع الصورة')
        setImagesPopupOpen(true)
      } else {
        showToast('⚠ تعذّر رفع الصورة')
      }
    } catch {
      showToast('⚠ تعذّر رفع الصورة')
    }
    finally { setUploadingImage(false) }
  }

  const handleDownload = async (url: string, idx: number) => {
    try { const r = await fetch(url); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `workshop-image-${idx + 1}.jpg`; a.click(); URL.revokeObjectURL(a.href) }
    catch { window.open(url, '_blank') }
  }

  const sendToInsurance = async () => {
    setSending(true)
    try {
      const token = localStorage.getItem('token')
      const counterOffer = {
        part_prices: editPartPrices,
        repair_groups: editRepairGroups,
        replace_groups: editReplaceGroups,
        total_parts: totalParts,
        total_repair: totalRepair,
        total_replace_labor: totalReplace,
        grand_total: grandTotal,
      }
      const res = await fetch(apiUrl(`/api/estimates/${estimateId}/negotiate-revision`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workshop_counter_offer_pricing: counterOffer, workshop_labor_comments: workshopLaborComments, workshop_part_comments: workshopPartComments }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `فشل إرسال الرد (${res.status})`)
      }
      localStorage.removeItem(draftKey)
      navigate('/dashboard')
    } catch (e) { setError((e as Error).message) }
    finally   { setSending(false); setShowSendDialog(false) }
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>⏳ جاري التحميل...</div>
  if (error)   return <div style={{ padding: '3rem', textAlign: 'center', color: '#dc2626' }}>{error}</div>
  if (!estimate) return null

  const ins  = estimate.insurance_negotiated_pricing
  const orig = estimate.pricing_data
  if (!ins && !orig) return <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>لا توجد بيانات تفاوض</div>

  const source = ins || orig!

  const getPartComment = (name: string) => estimate.insurance_part_comments?.find(c => c.part_name_ar === name)?.comment || null

  // Dynamic totals
  const totalParts   = editPartPrices.reduce((s, p) => s + (p.price || 0), 0)
  const totalRepair  = editRepairGroups.reduce((s, g) => s + (g.total || 0), 0)
  const totalReplace = editReplaceGroups.reduce((s, g) => s + (g.total || 0), 0)
  const grandTotal   = totalParts + totalRepair + totalReplace

  // Source lookup helpers
  const srcPartPrice   = (name: string) => source.part_prices?.find(p => p.part_name_ar === name)?.price
  const srcRepairTotal = (name: string) => source.repair_groups?.find(g => g.labor_name_ar === name)?.total
  const srcReplaceTotal = (name: string) => source.replace_groups?.find(g => g.labor_name_ar === name)?.total

  // Merge edit groups into unified map
  const laborMap = new Map<string, { repair: LaborGroup | null; replace: LaborGroup | null }>()
  editRepairGroups.forEach(g => { laborMap.set(g.labor_name_ar, { repair: g, replace: laborMap.get(g.labor_name_ar)?.replace || null }) })
  editReplaceGroups.forEach(g => { const e = laborMap.get(g.labor_name_ar) || { repair: null, replace: null }; laborMap.set(g.labor_name_ar, { ...e, replace: g }) })
  const laborEntries = Array.from(laborMap.entries())

  // Used labor names to filter add dropdowns
  const usedRepairNames  = new Set(editRepairGroups.map(g => g.labor_name_ar))
  const usedReplaceNames = new Set(editReplaceGroups.map(g => g.labor_name_ar))
  const availableLabors  = LABOR_TYPES.filter(lt => !(newLaborType === 'repair' ? usedRepairNames : usedReplaceNames).has(lt.nameAr))

  const td: React.CSSProperties = { padding: '0.6rem 1rem', fontSize: '0.875rem', verticalAlign: 'top' }
  const thS: React.CSSProperties = { padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '0.8rem', borderBottom: '2px solid', background: 'inherit' }

  // Helpers to update groups
  const setRepairGroupTotal = (name: string, val: number) =>
    setEditRepairGroups(prev => prev.map(g => g.labor_name_ar === name ? { ...g, total: val } : g))
  const setReplaceGroupTotal = (name: string, val: number) =>
    setEditReplaceGroups(prev => prev.map(g => g.labor_name_ar === name ? { ...g, total: val } : g))
  const removeRepairGroup = (name: string) => {
    setEditRepairGroups(prev => prev.filter(g => g.labor_name_ar !== name))
    if (source.repair_groups?.some(g => g.labor_name_ar === name))
      setRemovedRepairNames(prev => prev.includes(name) ? prev : [...prev, name])
  }
  const removeReplaceGroup = (name: string) => {
    setEditReplaceGroups(prev => prev.filter(g => g.labor_name_ar !== name))
    if (source.replace_groups?.some(g => g.labor_name_ar === name))
      setRemovedReplaceNames(prev => prev.includes(name) ? prev : [...prev, name])
  }
  const restoreRepairGroup = (name: string) => {
    const orig = source.repair_groups?.find(g => g.labor_name_ar === name)
    if (orig) setEditRepairGroups(prev => [...prev, { ...orig, parts: [...orig.parts] }])
    setRemovedRepairNames(prev => prev.filter(n => n !== name))
  }
  const restoreReplaceGroup = (name: string) => {
    const orig = source.replace_groups?.find(g => g.labor_name_ar === name)
    if (orig) setEditReplaceGroups(prev => [...prev, { ...orig, parts: [...orig.parts] }])
    setRemovedReplaceNames(prev => prev.filter(n => n !== name))
  }
  const removeLaborPart = (type: 'repair' | 'replace', laborName: string, partName: string) => {
    const setter = type === 'repair' ? setEditRepairGroups : setEditReplaceGroups
    setter(prev => prev.map(g => g.labor_name_ar === laborName ? { ...g, parts: g.parts.filter(p => p !== partName) } : g))
    const srcGroup = type === 'repair'
      ? source.repair_groups?.find(g => g.labor_name_ar === laborName)
      : source.replace_groups?.find(g => g.labor_name_ar === laborName)
    if (srcGroup?.parts.includes(partName)) {
      const key = `${type}_${laborName}`
      setRemovedLaborParts(prev => ({ ...prev, [key]: [...(prev[key] || []).filter(p => p !== partName), partName] }))
    }
  }
  const restoreLaborPart = (type: 'repair' | 'replace', laborName: string, partName: string) => {
    const setter = type === 'repair' ? setEditRepairGroups : setEditReplaceGroups
    setter(prev => prev.map(g => g.labor_name_ar === laborName ? { ...g, parts: g.parts.includes(partName) ? g.parts : [...g.parts, partName] } : g))
    const key = `${type}_${laborName}`
    setRemovedLaborParts(prev => ({ ...prev, [key]: (prev[key] || []).filter(p => p !== partName) }))
  }
  const addLaborPart = (type: 'repair' | 'replace', laborName: string, partName: string) => {
    const key = `${type}_${laborName}`
    if (!partName.trim()) return
    const setter = type === 'repair' ? setEditRepairGroups : setEditReplaceGroups
    setter(prev => prev.map(g => g.labor_name_ar === laborName && !g.parts.includes(partName.trim()) ? { ...g, parts: [...g.parts, partName.trim()] } : g))
    setPendingLaborPart(prev => ({ ...prev, [key]: '' }))
  }
  const addLaborGroup = () => {
    if (!newLaborName) return
    const setter = newLaborType === 'repair' ? setEditRepairGroups : setEditReplaceGroups
    const used = newLaborType === 'repair' ? usedRepairNames : usedReplaceNames
    if (!used.has(newLaborName)) setter(prev => [...prev, { labor_name_ar: newLaborName, total: 0, parts: [] }])
    setNewLaborName('')
  }
  const removePart = (i: number) => {
    const name = editPartPrices[i].part_name_ar
    setEditPartPrices(prev => prev.filter((_, j) => j !== i))
    if (source.part_prices?.some(p => p.part_name_ar === name))
      setRemovedPartNames(prev => prev.includes(name) ? prev : [...prev, name])
  }
  const restorePart = (name: string) => {
    const orig = source.part_prices?.find(p => p.part_name_ar === name)
    if (orig) setEditPartPrices(prev => [...prev, { ...orig }])
    setRemovedPartNames(prev => prev.filter(n => n !== name))
  }
  const addReplacePart = () => {
    if (!newPartName.trim()) return
    if (editPartPrices.some(p => p.part_name_ar === newPartName.trim())) return
    setEditPartPrices(prev => [...prev, { part_name_ar: newPartName.trim(), price: parseFloat(newPartPrice) || 0 }])
    setNewPartName(''); setNewPartPrice('')
  }

  const inputStyle = (borderColor: string): React.CSSProperties => ({
    width: '90px', padding: '0.25rem 0.4rem', border: `1.5px solid ${borderColor}`,
    borderRadius: '0.375rem', textAlign: 'center', fontWeight: 700,
    fontSize: '0.82rem', direction: 'ltr',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '1.5rem 1rem', direction: 'rtl' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: toast.startsWith('✓') ? '#065f46' : '#b91c1c', color: 'white', padding: '0.6rem 1.4rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.9rem', boxShadow: '0 6px 20px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.25rem 1.5rem', marginBottom: '1.25rem', border: '1px solid #e5e7eb' }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem', padding: 0 }}>← العودة للتقديرات</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.3rem', fontWeight: 800, color: '#111827' }}>{estimate.vehicle_make} {estimate.vehicle_model} {estimate.vehicle_year}</h1>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>مراجعة عرض التأمين — يمكنك تعديل الأسعار والأعمال</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setImagesPopupOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.8rem', background: extraImages.length > 0 ? '#f5f3ff' : '#f9fafb', border: `1.5px solid ${extraImages.length > 0 ? '#7c3aed' : '#e5e7eb'}`, borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', color: extraImages.length > 0 ? '#7c3aed' : '#9ca3af' }}>
                🖼 {extraImages.length > 0 ? `${extraImages.length} صورة` : 'صور الورشة'}
              </button>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.8rem', background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: '0.5rem', cursor: uploadingImage ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.82rem', color: '#1d4ed8' }}>
                {uploadingImage ? '⏳' : '📤'} رفع صورة
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }} />
              <span style={{ padding: '0.35rem 1rem', borderRadius: '999px', background: '#fffbeb', border: '1.5px solid #d97706', color: '#d97706', fontWeight: 700, fontSize: '0.82rem' }}>🔄 تفاوض</span>
            </div>
          </div>
        </div>

        {estimate.insurance_comment && (
          <div style={{ background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: '0.6rem', padding: '0.85rem 1.1rem', marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.82rem', marginBottom: '0.3rem' }}>ملاحظة التأمين العامة</div>
            <div style={{ color: '#78350f', fontSize: '0.9rem' }}>{estimate.insurance_comment}</div>
          </div>
        )}

        {draftSavedAt && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', padding: '0.5rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#15803d', fontWeight: 600 }} >
            ✅ تم حفظ التعديلات تلقائياً
            <span style={{ color: '#6b7280', fontWeight: 400 }}>— آخر حفظ {draftSavedAt.toLocaleTimeString('ar-EG')}</span>
          </div>
        )}

        {/* ── 1. REPLACEABLE PARTS ── */}
        <div style={{ background: 'white', borderRadius: '0.75rem', marginBottom: '1.25rem', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          <div style={{ padding: '0.85rem 1.25rem', background: '#f3f4f6', borderBottom: '2px solid #1e3a8a', fontWeight: 700, color: '#1e3a8a' }}>قطع الغيار</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ ...thS, borderColor: '#e5e7eb' }}>القطعة</th>
                <th style={{ ...thS, borderColor: '#e5e7eb', textAlign: 'center', width: '160px' }}>السعر (ج.م)</th>
                <th style={{ ...thS, borderColor: '#e5e7eb', width: '36px' }}></th>
              </tr>
            </thead>
            <tbody>
              {editPartPrices.map((p, i) => {
                const origPrice      = srcPartPrice(p.part_name_ar)
                const insComment     = getPartComment(p.part_name_ar)
                const workshopReply  = workshopPartComments[p.part_name_ar] || ''
                return (
                  <Fragment key={i}>
                    <tr style={{ borderBottom: insComment ? 'none' : '1px solid #f3f4f6', verticalAlign: 'middle' }}>
                      <td style={{ ...td, fontWeight: 600, color: '#111827' }}>{p.part_name_ar}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                          <BeforeTag orig={origPrice} curr={p.price} />
                          <input type="number" min="0" value={p.price}
                            onFocus={e => e.target.select()}
                            onChange={e => setEditPartPrices(prev => prev.map((pp, j) => j === i ? { ...pp, price: Math.max(0, parseFloat(e.target.value) || 0) } : pp))}
                            style={{ ...inputStyle('#bfdbfe'), color: origPrice !== undefined && p.price !== origPrice ? '#1d4ed8' : '#111827' }}
                          />
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <button onClick={() => removePart(i)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.85rem', padding: '0 4px' }}>✕</button>
                      </td>
                    </tr>
                    {insComment && (
                      <>
                        <tr style={{ background: '#fffbeb', borderBottom: 'none' }}>
                          <td colSpan={3} style={{ padding: '0.3rem 1rem 0.4rem', fontSize: '0.8rem', color: '#92400e' }}>
                            💬 <strong>ملاحظة التأمين:</strong> {insComment}
                          </td>
                        </tr>
                        <tr style={{ background: workshopReply ? '#f0fdf4' : 'white', borderBottom: '1px solid #f3f4f6' }}>
                          <td colSpan={3} style={{ padding: '0.3rem 1rem 0.4rem' }}>
                            <textarea rows={1} value={workshopReply}
                              onChange={e => setWorkshopPartComments(prev => ({ ...prev, [p.part_name_ar]: e.target.value }))}
                              placeholder="رد الورشة على هذه القطعة..."
                              style={{ width: '100%', padding: '0.35rem 0.7rem', border: `1.5px solid ${workshopReply ? '#6ee7b7' : '#e5e7eb'}`, borderRadius: '0.375rem', fontSize: '0.82rem', textAlign: 'right', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#065f46', background: workshopReply ? '#f0fdf4' : '#fafafa' }}
                            />
                          </td>
                        </tr>
                      </>
                    )}
                  </Fragment>
                )
              })}
              {/* Removed parts */}
              {removedPartNames.map(name => {
                const orig = source.part_prices?.find(p => p.part_name_ar === name)
                if (!orig) return null
                return (
                  <tr key={`removed_${name}`} style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', verticalAlign: 'middle' }}>
                    <td style={{ ...td, color: '#9ca3af', textDecoration: 'line-through' }}>
                      {name}
                      <span style={{ marginRight: '0.5rem', padding: '1px 7px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '999px', color: '#dc2626', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-block' }}>محذوف</span>
                    </td>
                    <td style={{ ...td, textAlign: 'center', color: '#9ca3af', textDecoration: 'line-through' }}>{orig.price.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button onClick={() => restorePart(name)}
                        style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer', color: '#6b7280', fontSize: '0.75rem', padding: '2px 6px', fontWeight: 600 }}>↺ استعادة</button>
                    </td>
                  </tr>
                )
              })}

              {/* Add part row */}
              <tr style={{ background: '#f9fafb', borderTop: '1px dashed #e5e7eb' }}>
                <td colSpan={3} style={{ padding: '0.6rem 1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <PartAutocomplete value={newPartName} onChange={setNewPartName} onSelect={setNewPartName} placeholder="اسم القطعة" />
                    <input type="number" min="0" value={newPartPrice} onChange={e => setNewPartPrice(e.target.value)}
                      placeholder="السعر" style={{ width: '90px', padding: '0.4rem 0.5rem', border: '1.5px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.82rem', textAlign: 'center', direction: 'ltr' }} />
                    <button onClick={addReplacePart} disabled={!newPartName.trim()}
                      style={{ padding: '0.4rem 0.9rem', background: newPartName.trim() ? '#1e3a8a' : '#9ca3af', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 700, fontSize: '0.82rem', cursor: newPartName.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                      ➕ إضافة قطعة
                    </button>
                  </div>
                </td>
              </tr>
              <tr style={{ background: '#f3f4f6', borderTop: '2px solid #1e3a8a' }}>
                <td style={{ ...td, fontWeight: 700, color: '#1e3a8a' }}>إجمالى قطع الغيار</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: '#1e3a8a' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                    {source.total_parts !== totalParts && <span style={{ color: '#9ca3af', fontSize: '0.75rem', textDecoration: 'line-through' }}>{(source.total_parts || 0).toLocaleString()}</span>}
                    <span>{totalParts.toLocaleString()}</span>
                  </div>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── 2. MERGED LABOR TABLE ── */}
        <div style={{ background: 'white', borderRadius: '0.75rem', marginBottom: '1.25rem', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          <div style={{ padding: '0.85rem 1.25rem', background: '#f5f3ff', borderBottom: '2px solid #7c3aed', fontWeight: 700, color: '#5b21b6' }}>وصف الأعمال</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ ...thS, borderColor: '#ddd6fe', width: '200px' }}>العمل</th>
                <th style={{ ...thS, borderColor: '#ddd6fe' }}>القطع</th>
                <th style={{ ...thS, borderColor: '#ddd6fe', textAlign: 'center', width: '180px' }}>التكلفة (ج.م)</th>
                <th style={{ ...thS, borderColor: '#ddd6fe', width: '36px' }}></th>
              </tr>
            </thead>
            <tbody>
              {laborEntries.map(([name, { repair, replace }], i) => {
                const hasBoth         = !!repair && !!replace
                const combined        = (repair?.total || 0) + (replace?.total || 0)
                const origCombined    = (srcRepairTotal(name) ?? (repair?.total || 0)) + (srcReplaceTotal(name) ?? (replace?.total || 0))
                const renderSubRow = (
                  g: LaborGroup, type: 'repair' | 'replace',
                  Badge: () => JSX.Element, origTotal: number | undefined, isSecond: boolean
                ) => {
                  const key           = `${type}_${name}`
                  const insComment    = g.comment
                  const workshopReply = workshopLaborComments[key] || ''
                  const divider       = isSecond ? '2px solid #ede9fe' : '1px solid #f5f3ff'
                  return (
                    <Fragment key={key}>
                      <tr style={{ borderBottom: insComment ? 'none' : divider, verticalAlign: 'top', background: isSecond && hasBoth ? '#fafafa' : 'white' }}>
                        <td style={{ ...td, fontWeight: 700, color: '#5b21b6', whiteSpace: 'nowrap', paddingRight: isSecond && hasBoth ? '1.75rem' : undefined }}>
                          {isSecond && hasBoth ? '' : name} <Badge />
                        </td>
                        <td style={{ ...td }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            {g.parts.map((part, pi) => (
                              <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', color: '#374151' }}>
                                <button onClick={() => removeLaborPart(type, name, part)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.72rem', padding: '0 2px', flexShrink: 0 }}>✕</button>
                                <span>{part}</span>
                              </div>
                            ))}
                            {/* Removed parts under this labor */}
                            {(removedLaborParts[key] || []).map((part, pi) => (
                              <div key={`removed_${pi}`} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', color: '#9ca3af' }}>
                                <button onClick={() => restoreLaborPart(type, name, part)}
                                  style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '0.25rem', cursor: 'pointer', color: '#6b7280', fontSize: '0.65rem', padding: '1px 4px', flexShrink: 0 }}>↺</button>
                                <span style={{ textDecoration: 'line-through' }}>{part}</span>
                                <span style={{ padding: '0px 5px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '999px', color: '#dc2626', fontSize: '0.62rem', fontWeight: 700 }}>محذوف</span>
                              </div>
                            ))}
                            {/* Add part to labor */}
                            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginTop: '0.3rem', paddingTop: '0.3rem', borderTop: '1px dashed #e5e7eb' }}>
                              <PartAutocomplete
                                value={pendingLaborPart[key] || ''}
                                onChange={v => setPendingLaborPart(prev => ({ ...prev, [key]: v }))}
                                onSelect={v => setPendingLaborPart(prev => ({ ...prev, [key]: v }))}
                                placeholder="أضف قطعة"
                              />
                              <button onClick={() => addLaborPart(type, name, pendingLaborPart[key] || '')}
                                disabled={!pendingLaborPart[key]?.trim()}
                                style={{ padding: '0.3rem 0.6rem', background: pendingLaborPart[key]?.trim() ? '#7c3aed' : '#9ca3af', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.75rem', cursor: pendingLaborPart[key]?.trim() ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                                ➕
                              </button>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                            <BeforeTag orig={origTotal} curr={g.total} />
                            <input type="number" min="0" value={g.total}
                              onFocus={e => e.target.select()}
                              onChange={e => {
                                const v = Math.max(0, parseFloat(e.target.value) || 0)
                                type === 'repair' ? setRepairGroupTotal(name, v) : setReplaceGroupTotal(name, v)
                              }}
                              style={{ ...inputStyle(type === 'repair' ? '#16a34a' : '#e11d48'), color: type === 'repair' ? '#059669' : '#e11d48' }}
                            />
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <button onClick={() => type === 'repair' ? removeRepairGroup(name) : removeReplaceGroup(name)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.85rem' }}>✕</button>
                        </td>
                      </tr>
                      {insComment && (
                        <>
                          <tr style={{ background: '#fffbeb', borderBottom: 'none' }}>
                            <td colSpan={4} style={{ padding: '0.3rem 1rem 0.4rem', fontSize: '0.8rem', color: '#92400e' }}>
                              💬 <strong>ملاحظة التأمين:</strong> {insComment}
                            </td>
                          </tr>
                          <tr style={{ background: workshopReply ? '#f0fdf4' : 'white', borderBottom: divider }}>
                            <td colSpan={4} style={{ padding: '0.3rem 1rem 0.4rem' }}>
                              <textarea rows={1} value={workshopReply}
                                onChange={e => setWorkshopLaborComments(prev => ({ ...prev, [key]: e.target.value }))}
                                placeholder="رد الورشة على هذا البند..."
                                style={{ width: '100%', padding: '0.35rem 0.7rem', border: `1.5px solid ${workshopReply ? '#6ee7b7' : '#e5e7eb'}`, borderRadius: '0.375rem', fontSize: '0.82rem', textAlign: 'right', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#065f46', background: workshopReply ? '#f0fdf4' : '#fafafa' }}
                              />
                            </td>
                          </tr>
                        </>
                      )}
                      {!insComment && <tr style={{ height: 0 }}><td colSpan={4} style={{ padding: 0, borderBottom: divider }} /></tr>}
                    </Fragment>
                  )
                }

                return (
                  <Fragment key={i}>
                    {repair  && renderSubRow(repair,  'repair',  RepairBadge,  srcRepairTotal(name),  false)}
                    {replace && renderSubRow(replace, 'replace', ReplaceBadge, srcReplaceTotal(name), !!repair)}
                    {hasBoth && (
                      <tr style={{ background: '#f5f3ff', borderBottom: '1px solid #ddd6fe' }}>
                        <td colSpan={2} style={{ ...td, fontSize: '0.8rem', color: '#7c3aed', fontWeight: 600, paddingRight: '2.5rem' }}>مجموع {name}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                            {origCombined !== combined && <span style={{ color: '#9ca3af', fontSize: '0.75rem', textDecoration: 'line-through' }}>{origCombined.toLocaleString()}</span>}
                            <span>{combined.toLocaleString()}</span>
                          </div>
                        </td>
                        <td />
                      </tr>
                    )}
                  </Fragment>
                )
              })}

              {/* Removed labor groups */}
              {removedRepairNames.map(name => {
                const orig = source.repair_groups?.find(g => g.labor_name_ar === name)
                if (!orig) return null
                return (
                  <tr key={`removed_repair_${name}`} style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', verticalAlign: 'middle' }}>
                    <td style={{ ...td, color: '#9ca3af', textDecoration: 'line-through', whiteSpace: 'nowrap' }}>
                      {name} <RepairBadge />
                      <span style={{ marginRight: '0.4rem', padding: '1px 7px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '999px', color: '#dc2626', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>محذوف</span>
                    </td>
                    <td style={{ ...td, color: '#9ca3af', textDecoration: 'line-through', fontSize: '0.82rem' }}>{orig.parts.join('، ') || '—'}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#9ca3af', textDecoration: 'line-through' }}>{orig.total.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button onClick={() => restoreRepairGroup(name)}
                        style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer', color: '#6b7280', fontSize: '0.75rem', padding: '2px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>↺ استعادة</button>
                    </td>
                  </tr>
                )
              })}
              {removedReplaceNames.map(name => {
                const orig = source.replace_groups?.find(g => g.labor_name_ar === name)
                if (!orig) return null
                return (
                  <tr key={`removed_replace_${name}`} style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', verticalAlign: 'middle' }}>
                    <td style={{ ...td, color: '#9ca3af', textDecoration: 'line-through', whiteSpace: 'nowrap' }}>
                      {name} <ReplaceBadge />
                      <span style={{ marginRight: '0.4rem', padding: '1px 7px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '999px', color: '#dc2626', fontSize: '0.68rem', fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>محذوف</span>
                    </td>
                    <td style={{ ...td, color: '#9ca3af', textDecoration: 'line-through', fontSize: '0.82rem' }}>{orig.parts.join('، ') || '—'}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#9ca3af', textDecoration: 'line-through' }}>{orig.total.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button onClick={() => restoreReplaceGroup(name)}
                        style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer', color: '#6b7280', fontSize: '0.75rem', padding: '2px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>↺ استعادة</button>
                    </td>
                  </tr>
                )
              })}

              {/* Add labor group row */}
              <tr style={{ background: '#f9fafb', borderTop: '1px dashed #ddd6fe' }}>
                <td colSpan={4} style={{ padding: '0.65rem 1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={newLaborType} onChange={e => { setNewLaborType(e.target.value as 'repair' | 'replace'); setNewLaborName('') }}
                      style={{ padding: '0.4rem 0.5rem', border: '1.5px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.82rem', direction: 'rtl', background: 'white' }}>
                      <option value="repair">إصلاح</option>
                      <option value="replace">تغيير</option>
                    </select>
                    <select value={newLaborName} onChange={e => setNewLaborName(e.target.value)}
                      style={{ flex: 1, minWidth: '160px', padding: '0.4rem 0.5rem', border: '1.5px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.82rem', direction: 'rtl', background: 'white' }}>
                      <option value="">-- اختر نوع العمل --</option>
                      {availableLabors.map(lt => <option key={lt.key} value={lt.nameAr}>{lt.nameAr}</option>)}
                    </select>
                    <button onClick={addLaborGroup} disabled={!newLaborName}
                      style={{ padding: '0.4rem 0.9rem', background: newLaborName ? '#7c3aed' : '#9ca3af', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: 700, fontSize: '0.82rem', cursor: newLaborName ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                      ➕ إضافة عمل
                    </button>
                  </div>
                </td>
              </tr>

              {/* Labor total */}
              <tr style={{ background: '#f5f3ff', borderTop: '2px solid #7c3aed' }}>
                <td colSpan={2} style={{ ...td, fontWeight: 700, color: '#5b21b6' }}>إجمالى الأعمال</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: '#7c3aed' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                    {(() => { const src = (source.total_repair || 0) + (source.total_replace_labor || 0); return src !== (totalRepair + totalReplace) ? <span style={{ color: '#9ca3af', fontSize: '0.75rem', textDecoration: 'line-through' }}>{src.toLocaleString()}</span> : null })()}
                    <span>{(totalRepair + totalReplace).toLocaleString()}</span>
                  </div>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Grand total */}
        <div style={{ background: '#1e3a8a', borderRadius: '0.75rem', padding: '1rem 1.5rem', marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {source.grand_total !== grandTotal && (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', textDecoration: 'line-through' }}>{(source.grand_total || 0).toLocaleString()}</span>
            )}
            <span style={{ color: 'white', fontWeight: 800, fontSize: '1.15rem' }}>{grandTotal.toLocaleString()} ج.م</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '0.9rem' }}>إجمالى عرض الورشة</span>
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={() => setShowSendDialog(true)}
            style={{ flex: 1, padding: '1rem', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '0.6rem', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}>
            📤 إرسال للتأمين
          </button>
          <button onClick={() => navigate('/dashboard')}
            style={{ padding: '1rem 1.5rem', background: 'white', color: '#6b7280', border: '1.5px solid #d1d5db', borderRadius: '0.6rem', fontWeight: 700, cursor: 'pointer' }}>
            إلغاء
          </button>
        </div>
      </div>

      {/* Images popup */}
      {imagesPopupOpen && (
        <>
          <div onClick={() => setImagesPopupOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: '1rem', width: '90%', maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', zIndex: 101, direction: 'rtl', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>🖼 صور إضافية من الورشة</div>
              <button onClick={() => setImagesPopupOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '1rem', flex: 1 }}>
              {extraImages.length === 0
                ? <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>لا توجد صور بعد</div>
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem' }}>
                    {extraImages.map((img, idx) => (
                      <div key={idx} style={{ position: 'relative' }}>
                        <img src={img.cloudinary_url} alt="" onClick={() => setLightboxUrl(img.cloudinary_url)}
                          style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', display: 'block' }} />
                        <button onClick={e => { e.stopPropagation(); handleDownload(img.cloudinary_url, idx) }}
                          style={{ position: 'absolute', bottom: '5px', left: '5px', backgroundColor: 'rgba(0,0,0,0.55)', color: 'white', border: 'none', borderRadius: '5px', padding: '3px 6px', fontSize: '0.75rem', cursor: 'pointer' }}>⬇</button>
                      </div>
                    ))}
                  </div>
              }
            </div>
            {extraImages.length > 0 && (
              <div style={{ padding: '1rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center' }}>
                <button onClick={() => extraImages.forEach((img, idx) => handleDownload(img.cloudinary_url, idx))}
                  style={{ padding: '0.65rem 1.75rem', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '0.6rem', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>⬇ تحميل الكل</button>
              </div>
            )}
          </div>
        </>
      )}

      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightboxUrl} alt="" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: '8px', objectFit: 'contain' }} />
        </div>
      )}

      {/* Send dialog */}
      {showSendDialog && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '2rem', maxWidth: '400px', width: '90%', direction: 'rtl', textAlign: 'right', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>تأكيد الإرسال للتأمين</h3>
            <p style={{ margin: '0 0 0.5rem', color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.6 }}>سيتم إرسال تعديلات الورشة للتأمين بإجمالي:</p>
            <p style={{ margin: '0 0 1.5rem', color: '#1e3a8a', fontWeight: 800, fontSize: '1.2rem' }}>{grandTotal.toLocaleString()} ج.م</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={sendToInsurance} disabled={sending}
                style={{ flex: 1, padding: '0.75rem', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', fontSize: '0.95rem' }}>
                {sending ? '...' : 'إرسال'}
              </button>
              <button onClick={() => setShowSendDialog(false)}
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

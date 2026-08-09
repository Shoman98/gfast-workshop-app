import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import partsDb from '@/data/parts.json'

const PARTS_LIST: { partId: string; key: string; nameAr: string; nameEn: string }[] = partsDb

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

interface Part {
  id?: string
  partId?: string
  part_name_en: string
  part_name_ar: string
  damage_type: string
  confidence?: number
  severity_label: 'Repair' | 'Replace'
  price: number
  is_ai_detected?: boolean
  assignedLabors?: string[]
}

interface PricingEntry { part_name_ar: string; hrs: number; hr_price: number; cost: number; isUnknown?: boolean }
interface LaborGroup { labor_key: string; labor_name_ar: string; entries: PricingEntry[]; total: number }
interface PartPrice { part_name_ar: string; partId: string; part_price: number }
interface PricingSection {
  groups: LaborGroup[]
  labor_total: number
  total: number
  part_prices?: PartPrice[]
  parts_total?: number
}
interface PricingData { repair: PricingSection; replace: PricingSection }

interface AuditLog {
  id: string
  action_type: string
  action_description_ar: string
  timestamp: string
  field?: string
  old_value?: string
  new_value?: string
}

interface Labor {
  id?: string
  labor_name_ar: string
  price: number
}

interface AddPartFormProps {
  onAdd: (part: { partId?: string; part_name_ar: string; part_name_en: string; damage_type: string; severity_label: 'Repair' | 'Replace'; price: number; assignedLabors?: string[] }) => void
  disabled: boolean
  existingParts: { part_name_ar: string; partId?: string }[]
}

function AddPartForm({ onAdd, disabled, existingParts }: AddPartFormProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedPartId, setSelectedPartId] = useState<string | undefined>(undefined)
  const [severity, setSeverity] = useState<'Repair' | 'Replace'>('Repair')
  const [selectedLabors, setSelectedLabors] = useState<string[]>([])
  const [error, setError] = useState('')
  const [pendingDuplicate, setPendingDuplicate] = useState<Parameters<typeof onAdd>[0] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query.trim()
    ? PARTS_LIST.filter(p =>
        p.nameAr.includes(query) ||
        p.nameEn.toLowerCase().includes(query.toLowerCase()) ||
        p.partId.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 40)
    : PARTS_LIST.slice(0, 40)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (part: typeof PARTS_LIST[0]) => {
    setQuery(part.nameAr)
    setSelectedPartId(part.partId)
    setSelectedLabors([])
    setOpen(false)
  }

  const toggleLabor = (key: string) => {
    setSelectedLabors(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const buildPart = () => {
    const matched = PARTS_LIST.find(p => p.nameAr === query.trim())
    const isUnknown = !selectedPartId && !matched
    return {
      partId: matched?.partId || selectedPartId,
      part_name_ar: query.trim(),
      part_name_en: matched?.nameEn || '',
      damage_type: 'Unknown',
      severity_label: severity,
      price: 0,
      assignedLabors: isUnknown ? selectedLabors : undefined,
    }
  }

  const resetForm = () => {
    setQuery(''); setSelectedPartId(undefined); setSeverity('Repair'); setSelectedLabors([])
  }

  const handleAdd = () => {
    if (!query.trim()) { setError('يرجى إدخال اسم الجزء'); return }
    const isUnknown = !selectedPartId && !PARTS_LIST.some(p => p.nameAr === query.trim())
    if (isUnknown && selectedLabors.length === 0) { setError('يرجى تحديد نوع العمل'); return }
    setError('')
    const part = buildPart()
    // Check duplicate by part name or partId
    const isDuplicate = existingParts.some(
      p => p.part_name_ar === part.part_name_ar || (part.partId && p.partId === part.partId)
    )
    if (isDuplicate) {
      setPendingDuplicate(part)
      return
    }
    onAdd(part)
    resetForm()
  }

  const isFromDb = !!selectedPartId || PARTS_LIST.some(p => p.nameAr === query.trim())
  const isUnknown = query.trim().length > 0 && !isFromDb

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Searchable part input */}
      <div ref={containerRef} style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedPartId(undefined); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="ابحث عن الجزء أو أضف جزء جديد..."
          disabled={disabled}
          style={{
            width: '100%', padding: '0.75rem 1rem', border: '2px solid #d1d5db',
            borderRadius: '0.5rem', textAlign: 'right', outline: 'none',
            fontSize: '0.95rem', boxSizing: 'border-box' as const,
            borderColor: isFromDb && query ? '#2563eb' : '#d1d5db',
          }}
        />

        {open && query.trim() && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            backgroundColor: 'white', border: '1.5px solid #e5e7eb', borderRadius: '0.5rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 999,
            maxHeight: '220px', overflowY: 'auto', direction: 'rtl',
          }}>
            {filtered.length > 0 ? (
              <>
                {filtered.map(part => (
                  <div
                    key={part.partId}
                    onMouseDown={() => handleSelect(part)}
                    style={{
                      padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.9rem',
                      borderBottom: '1px solid #f3f4f6', display: 'flex',
                      justifyContent: 'space-between', alignItems: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f0f9ff'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{part.partId}</span>
                    <span style={{ color: '#111827', fontWeight: '500' }}>{part.nameAr}</span>
                  </div>
                ))}
                {!PARTS_LIST.some(p => p.nameAr === query.trim()) && (
                  <div
                    onMouseDown={() => { setSelectedPartId(undefined); setOpen(false) }}
                    style={{ padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.85rem', color: '#7c3aed', fontWeight: '600', borderTop: '1px solid #e5e7eb', textAlign: 'right' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f5f3ff'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
                  >
                    ➕ إضافة "{query}" كجزء جديد
                  </div>
                )}
              </>
            ) : (
              <div
                onMouseDown={() => { setSelectedPartId(undefined); setOpen(false) }}
                style={{ padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.85rem', color: '#7c3aed', fontWeight: '600', textAlign: 'right' }}
              >
                ➕ إضافة "{query}" كجزء جديد
              </div>
            )}
          </div>
        )}
      </div>

      {/* Severity toggle */}
      <select
        value={severity}
        onChange={(e) => setSeverity(e.target.value as any)}
        disabled={disabled}
        style={{
          padding: '0.6rem 0.75rem', border: '2px solid #d1d5db', borderRadius: '0.5rem',
          textAlign: 'right', outline: 'none', width: '100px',
          backgroundColor: severity === 'Replace' ? '#fef2f2' : '#f0fdf4',
          color: severity === 'Replace' ? '#dc2626' : '#16a34a', fontWeight: '600',
          cursor: 'pointer',
        }}
      >
        <option value="Repair">إصلاح</option>
        <option value="Replace">استبدال</option>
      </select>

      {/* Labor type selector — only for unknown parts */}
      {isUnknown && query.trim() && (
        <div style={{ border: '1.5px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
          <div style={{ padding: '0.6rem 1rem', backgroundColor: '#f9fafb', fontWeight: '700', color: '#374151', fontSize: '0.85rem', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>
            حدد أنواع الأعمال المرتبطة بهذا الجزء
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {LABOR_TYPES.map(lt => (
              <label
                key={lt.key}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  gap: '0.5rem', padding: '0.55rem 1rem', cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: selectedLabors.includes(lt.key) ? '#eff6ff' : 'white',
                  fontSize: '0.875rem', color: '#374151', direction: 'rtl',
                  transition: 'background 0.1s',
                }}
              >
                <span>{lt.nameAr}</span>
                <input
                  type="checkbox"
                  checked={selectedLabors.includes(lt.key)}
                  onChange={() => toggleLabor(lt.key)}
                  style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer' }}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <p style={{ color: '#dc2626', fontSize: '0.8rem', margin: 0, textAlign: 'right' }}>{error}</p>}

      <button
        onClick={handleAdd}
        disabled={disabled || !query.trim()}
        style={{
          width: '100%', padding: '0.75rem 1rem',
          backgroundColor: disabled || !query.trim() ? '#9ca3af' : '#16a34a',
          color: 'white', borderRadius: '0.5rem', fontWeight: 'bold',
          border: 'none', cursor: disabled || !query.trim() ? 'not-allowed' : 'pointer',
        }}
      >
        ➕ إضافة الجزء
      </button>

      {/* Duplicate confirmation modal */}
      {pendingDuplicate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.5rem', maxWidth: '380px', width: '90%', direction: 'rtl', textAlign: 'right' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: '700', color: '#92400e' }}>⚠️ الجزء موجود مسبقاً</h3>
            <p style={{ margin: '0 0 1.25rem', color: '#6b7280', fontSize: '0.9rem' }}>
              <strong>{pendingDuplicate.part_name_ar}</strong> موجود بالفعل في قائمة الأجزاء. هل تريد إضافته مرة أخرى؟
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => { onAdd(pendingDuplicate); setPendingDuplicate(null); resetForm() }}
                style={{ padding: '0.5rem 1.25rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '700', cursor: 'pointer' }}
              >نعم، أضف</button>
              <button
                onClick={() => setPendingDuplicate(null)}
                style={{ padding: '0.5rem 1.25rem', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer' }}
              >لا، إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EstimatePage() {
  const { estimateId } = useParams()
  const navigate = useNavigate()
  const [parts, setParts] = useState<Part[]>([])
  const [needsCheckParts, setNeedsCheckParts] = useState<Part[]>([])
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [labors, setLabors] = useState<Labor[]>([])
  const [pricingData, setPricingData] = useState<PricingData | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [editablePartPrices, setEditablePartPrices] = useState<{ partId: string; part_name_ar: string; price: number }[]>([])
  const [editableEntryCosts, setEditableEntryCosts] = useState<Record<string, number>>({})
  const [deletedEntries, setDeletedEntries] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<{ ek: string; label: string } | null>(null)
  const [manualLaborEntries, setManualLaborEntries] = useState<Record<string, { id: string; part_name_ar: string; cost: number }[]>>({})
  const [pendingManualAdd, setPendingManualAdd] = useState<Record<string, { partName: string; costStr: string }>>({})
  const [extraLaborGroups, setExtraLaborGroups] = useState<{ repair: string[]; replace: string[] }>({ repair: [], replace: [] })
  const [unifiedAddType, setUnifiedAddType] = useState<Record<string, 'repair' | 'replace'>>({})
  const [pendingLaborNewKey, setPendingLaborNewKey] = useState('')
  const [pendingLaborPick, setPendingLaborPick] = useState<{ index: number; newSeverity: 'Repair' | 'Replace'; selected: string[] } | null>(null)
  const [estimateStatus, setEstimateStatus] = useState<'draft' | 'confirmed'>('draft')
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState<{ index: number; partName: string } | null>(null)
  const [vehicleInfo, setVehicleInfo] = useState<{ year: number; make: string; model: string; insurance_company_id: string | null; vin_number?: string; customer_name?: string; customer_mobile?: string }>({ year: 0, make: '', model: '', insurance_company_id: null })
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  const fetchPricing = async (allParts: any[], make: string, model: string, year: number) => {
    if (!make || !model) return
    const token = localStorage.getItem('token')
    if (!token) return
    setPricingLoading(true)
    try {
      const res = await fetch(apiUrl('/api/pricing'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          parts: allParts.map(p => ({ partId: p.partId, part_name_ar: p.part_name_ar, severity_label: p.severity_label })),
          make, model, year: String(year),
        }),
      })
      if (!res.ok) {
        console.error('❌ Pricing API error:', res.status, res.statusText)
        return
      }
      let data = await res.json()
      console.log('📡 fetchPricing API response:', {
        success: data.success,
        repairGroupsCount: data.repair?.groups?.length || 0,
        replaceGroupsCount: data.replace?.groups?.length || 0,
        partPricesCount: data.replace?.part_prices?.length || 0,
        vehicle: `${make} ${model} ${year}`,
      })
      if (data.success) {
        // Merge unknown parts' assigned labors into pricing groups with cost 0
        const unknownParts = allParts.filter(p => !p.partId && (p.assignedLabors?.length ?? 0) > 0)
        if (unknownParts.length > 0) {
          const mergeGroups = (groups: LaborGroup[], sev: 'Repair' | 'Replace') => {
            const groupMap: Record<string, LaborGroup> = {}
            groups.forEach(g => { groupMap[g.labor_key] = { ...g, entries: [...g.entries] } })
            unknownParts.filter(p => p.severity_label === sev).forEach(p => {
              p.assignedLabors?.forEach((lk: string) => {
                const lt = LABOR_TYPES.find(l => l.key === lk)
                if (!lt) return
                if (!groupMap[lk]) groupMap[lk] = { labor_key: lk, labor_name_ar: lt.nameAr, entries: [], total: 0 }
                groupMap[lk].entries.push({ part_name_ar: p.part_name_ar, hrs: 0, hr_price: 0, cost: 0, isUnknown: true })
              })
            })
            return LABOR_TYPES.map(lt => groupMap[lt.key]).filter(Boolean)
          }
          data = {
            ...data,
            repair: { ...data.repair, groups: mergeGroups(data.repair.groups, 'Repair') },
            replace: { ...data.replace, groups: mergeGroups(data.replace.groups, 'Replace') },
          }
        }
        setPricingData(data)
        console.log('✅ fetchPricing: setPricingData called')
        // Pre-populate labors (for saving to DB)
        const laborMap: Record<string, number> = {}
        ;[...(data.repair?.groups || []), ...(data.replace?.groups || [])].forEach((g: LaborGroup) => {
          laborMap[g.labor_name_ar] = (laborMap[g.labor_name_ar] || 0) + g.total
        })
        const newLabors = Object.entries(laborMap).map(([labor_name_ar, price], i) => ({
          id: String(i + 1), labor_name_ar, price,
        }))
        setLabors(newLabors)
        // Initialize editableEntryCosts from all entries — preserve user edits
        setEditableEntryCosts(prev => {
          const next: Record<string, number> = { ...prev }
          ;[...(data.repair?.groups || []), ...(data.replace?.groups || [])].forEach((g: LaborGroup) => {
            g.entries.forEach((e: PricingEntry) => {
              const ek = `${g.labor_key}_${e.part_name_ar}`
              if (!(ek in prev)) next[ek] = e.cost
            })
          })
          return next
        })
        // Pre-populate editable part prices (preserve user edits, include unknown replace parts)
        const incoming = (data.replace?.part_prices || []) as PartPrice[]
        const incomingIds = new Set(incoming.map(p => p.partId))
        const unknownReplace = allParts
          .filter(p => p.severity_label === 'Replace' && (!p.partId || !incomingIds.has(p.partId)))
          .map(p => ({ partId: p.partId || `__unknown__${p.part_name_ar}`, part_name_ar: p.part_name_ar, part_price: 0 }))
        const allPrices = [...incoming, ...unknownReplace]
        setEditablePartPrices(prev => {
          const prevMap: Record<string, number> = {}
          prev.forEach(p => { prevMap[p.partId] = p.price })
          return allPrices.map(pp => ({
            partId: pp.partId,
            part_name_ar: pp.part_name_ar,
            price: prevMap[pp.partId] !== undefined ? prevMap[pp.partId] : pp.part_price,
          }))
        })
      }
    } catch (err) {
      console.error('❌ fetchPricing error:', err)
    } finally {
      setPricingLoading(false)
    }
  }

  const [parentEstimateId, setParentEstimateId] = useState<string | null>(null)

  useEffect(() => {
    if (estimateId === 'new') {
      // Check for supplement pre-fill first
      const supplementRaw = sessionStorage.getItem('supplementData')
      if (supplementRaw) {
        const sup = JSON.parse(supplementRaw)
        sessionStorage.removeItem('supplementData')
        setParentEstimateId(sup.parentEstimateId)
        if (sup.vehicle) {
          setVehicleInfo({
            year: sup.vehicle.year || 0,
            make: sup.vehicle.make || '',
            model: sup.vehicle.model || '',
            insurance_company_id: sup.vehicle.insurance_company_id || null,
            vin_number: sup.vehicle.vin_number,
            customer_name: sup.vehicle.customer_name,
            customer_mobile: sup.vehicle.customer_mobile,
          })
          fetchPricing([], sup.vehicle.make, sup.vehicle.model, sup.vehicle.year)
        }
        return
      }

      const analysisResult = sessionStorage.getItem('analysisResult')
      const vehicleData = sessionStorage.getItem('vehicleInfo')
      if (analysisResult) {
        const analysis = JSON.parse(analysisResult)
        console.log('📋 Estimate page loaded analysis:', {
          damages: analysis.damages?.length || 0,
          needs_check: analysis.needs_check_parts?.length || 0
        });
        const isMapped = (p: any) => p.part_name_ar && p.part_name_ar !== 'قطعة غير معروفة'
        const dedup = (parts: any[]) => {
          const seen = new Set<string>()
          return parts.filter(p => {
            const key = p.part_name_en?.toLowerCase().trim() || p.part_name_ar
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
        }
        const cleanDamages = dedup((analysis.damages || []).filter(isMapped))
          .map((p: any) => ({ ...p, ai_original_severity: p.severity_label }))
        const damageKeys = new Set(cleanDamages.map((p: any) => p.part_name_en?.toLowerCase().trim()))
        const cleanNeedsCheck = dedup((analysis.needs_check_parts || []).filter(isMapped))
          .filter((p: any) => !damageKeys.has(p.part_name_en?.toLowerCase().trim()))
          .map((p: any) => ({ ...p, ai_original_severity: p.severity_label }))
        setParts(cleanDamages)
        setNeedsCheckParts(cleanNeedsCheck)
        sessionStorage.removeItem('analysisResult')

        // Fetch pricing after parts are set
        if (vehicleData) {
          const vehicle = JSON.parse(vehicleData)
          const allParts = [...cleanDamages, ...cleanNeedsCheck]
          fetchPricing(allParts, vehicle.make, vehicle.model, vehicle.year)
        }
      }
      if (vehicleData) {
        const vehicle = JSON.parse(vehicleData)
        setVehicleInfo(vehicle)
        if (vehicle.parent_estimate_id) setParentEstimateId(vehicle.parent_estimate_id)
        sessionStorage.removeItem('vehicleInfo')
      }
    } else if (estimateId) {
      // Load existing audit logs for this estimate
      const loadAuditLogs = async () => {
        try {
          const token = localStorage.getItem('token')
          const response = await fetch(apiUrl(`/api/estimates/${estimateId}/audit-logs`), {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (response.ok) {
            const data = await response.json()
            setAuditLogs(data.logs || [])
          }
        } catch (err) {
          console.error('Failed to load audit logs:', err)
        }
      }
      loadAuditLogs()
    }
  }, [estimateId])

  const logAudit = async (action_type: string, action_description_ar: string, field?: string, old_value?: string, new_value?: string) => {
    if (!estimateId || estimateId === 'new') return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/api/estimates/${estimateId}/audit-logs`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action_type,
          action_description_ar,
          field: field || null,
          old_value: old_value || null,
          new_value: new_value || null,
        }),
      })

      if (response.ok) {
        const log = await response.json()
        const newLog: AuditLog = {
          id: log.logId,
          action_type,
          action_description_ar,
          timestamp: log.timestamp,
          field,
          old_value,
          new_value,
        }
        setAuditLogs([...auditLogs, newLog])
      }
    } catch (err) {
      console.error('Failed to log audit:', err)
    }
  }

  const confirmLaborPick = () => {
    if (!pendingLaborPick || pendingLaborPick.selected.length === 0) return
    const updated = parts.map((p, i) =>
      i === pendingLaborPick.index
        ? { ...p, severity_label: pendingLaborPick.newSeverity, assignedLabors: pendingLaborPick.selected }
        : p
    )
    setParts(updated)
    setPendingLaborPick(null)
    refreshPricing(updated)
  }

  const getGroupTotal = (laborKey: string, entries: PricingEntry[], type: string) => {
    const dbTotal = entries
      .filter(e => !deletedEntries.has(`${laborKey}_${e.part_name_ar}`))
      .reduce((s, e) => s + (editableEntryCosts[`${laborKey}_${e.part_name_ar}`] ?? e.cost), 0)
    const manualTotal = (manualLaborEntries[`${type}_${laborKey}`] || []).reduce((s, m) => s + m.cost, 0)
    return dbTotal + manualTotal
  }

  const removeManualEntry = (type: string, laborKey: string, id: string) => {
    const key = `${type}_${laborKey}`
    setManualLaborEntries(prev => ({ ...prev, [key]: (prev[key] || []).filter(m => m.id !== id) }))
  }

  const updateManualEntryCost = (type: string, laborKey: string, id: string, cost: number) => {
    const key = `${type}_${laborKey}`
    setManualLaborEntries(prev => ({
      ...prev,
      [key]: (prev[key] || []).map(m => m.id === id ? { ...m, cost } : m)
    }))
  }

  const getExtraGroupTotal = (type: string, laborKey: string) =>
    (manualLaborEntries[`${type}_${laborKey}`] || []).reduce((s, m) => s + m.cost, 0)

  const buildPricingSnapshot = () => {
    const repairGroups: any[] = []
    const replaceGroups: any[] = []

    // Capture DB pricing groups (when vehicle has known rates)
    ;(pricingData?.repair?.groups || []).forEach((g: LaborGroup) => {
      const groupParts: string[] = []
      g.entries.forEach((e: PricingEntry) => {
        if (!deletedEntries.has(`${g.labor_key}_${e.part_name_ar}`)) {
          groupParts.push(e.part_name_ar)
        }
      })
      ;(manualLaborEntries[`repair_${g.labor_key}`] || []).forEach((m: any) => {
        groupParts.push(m.part_name_ar)
      })
      const total = getGroupTotal(g.labor_key, g.entries, 'repair')
      repairGroups.push({ labor_name_ar: g.labor_name_ar, total, parts: groupParts })
    })

    ;(pricingData?.replace?.groups || []).forEach((g: LaborGroup) => {
      const groupParts: string[] = []
      g.entries.forEach((e: PricingEntry) => {
        if (!deletedEntries.has(`${g.labor_key}_${e.part_name_ar}`)) {
          groupParts.push(e.part_name_ar)
        }
      })
      ;(manualLaborEntries[`replace_${g.labor_key}`] || []).forEach((m: any) => {
        groupParts.push(m.part_name_ar)
      })
      const total = getGroupTotal(g.labor_key, g.entries, 'replace')
      replaceGroups.push({ labor_name_ar: g.labor_name_ar, total, parts: groupParts })
    })

    // Capture manually added extra labor groups
    extraLaborGroups.repair.forEach((lk: string) => {
      const entries = manualLaborEntries[`repair_${lk}`] || []
      const total = entries.reduce((s: number, e: any) => s + e.cost, 0)
      const groupParts = entries.map((e: any) => e.part_name_ar)
      const laborName = LABOR_TYPES.find(l => l.key === lk)?.nameAr || lk
      repairGroups.push({ labor_name_ar: laborName, total, parts: groupParts })
    })

    extraLaborGroups.replace.forEach((lk: string) => {
      const entries = manualLaborEntries[`replace_${lk}`] || []
      const total = entries.reduce((s: number, e: any) => s + e.cost, 0)
      const groupParts = entries.map((e: any) => e.part_name_ar)
      const laborName = LABOR_TYPES.find(l => l.key === lk)?.nameAr || lk
      replaceGroups.push({ labor_name_ar: laborName, total, parts: groupParts })
    })

    const totalRepair = repairGroups.reduce((s, g) => s + g.total, 0)
    const totalReplaceLab = replaceGroups.reduce((s, g) => s + g.total, 0)
    const totalParts = editablePartPrices.reduce((s, p) => s + (p.price || 0), 0)

    return {
      repair_groups: repairGroups,
      replace_groups: replaceGroups,
      part_prices: editablePartPrices.map(p => ({ part_name_ar: p.part_name_ar, price: p.price || 0 })),
      total_repair: totalRepair,
      total_replace_labor: totalReplaceLab,
      total_parts: totalParts,
      grand_total: totalRepair + totalReplaceLab + totalParts,
    }
  }

  const refreshPricing = (updatedParts: Part[]) => {
    fetchPricing(updatedParts, vehicleInfo.make, vehicleInfo.model, vehicleInfo.year)
  }

  const updatePart = (index: number, field: keyof Part, value: any) => {
    if (estimateStatus === 'confirmed') return

    const part = parts[index]
    const oldValue = String(part[field] || '')
    const newValue = String(value || '')

    if (oldValue === newValue) return

    const updated = [...parts]
    updated[index] = { ...updated[index], [field]: value }
    setParts(updated)

    if (field === 'severity_label') {
      logAudit('toggle_severity', `تم تغيير نوع الإصلاح من ${oldValue} إلى ${newValue} لقطعة ${part.part_name_ar}`, 'severity_label', oldValue, newValue)
      // Unknown part (no partId + has assignedLabors) → must re-pick labors for new severity
      if (!part.partId && part.assignedLabors !== undefined) {
        setPendingLaborPick({ index, newSeverity: value as 'Repair' | 'Replace', selected: [] })
        // Revert the change in parts state until user confirms labors
        setParts(parts.map((p, i) => i === index ? { ...p } : p))
        return
      }
      refreshPricing(updated)
    }
  }

  const removePart = (index: number) => {
    if (estimateStatus === 'confirmed') return
    const part = parts[index]
    setShowRemoveDialog({ index, partName: part.part_name_ar })
  }

  const confirmRemovePart = () => {
    if (!showRemoveDialog) return
    const { index } = showRemoveDialog
    const part = parts[index]
    const updated = parts.filter((_, i) => i !== index)
    setParts(updated)
    logAudit('remove_part', `تم حذف القطعة: ${part.part_name_ar}`, undefined, JSON.stringify(part))
    setShowRemoveDialog(null)
    refreshPricing(updated)
  }

  const approveNeedsCheckPart = (index: number) => {
    if (estimateStatus === 'confirmed') return

    const part = needsCheckParts[index]
    const updated = [...parts, part]
    setParts(updated)
    setNeedsCheckParts(needsCheckParts.filter((_, i) => i !== index))
    logAudit('approve_needs_check', `تمت الموافقة على القطعة المحتاجة للفحص: ${part.part_name_ar}`, undefined, undefined, JSON.stringify(part))
    refreshPricing(updated)
  }

  const rejectNeedsCheckPart = (index: number) => {
    if (estimateStatus === 'confirmed') return

    const part = needsCheckParts[index]
    setNeedsCheckParts(needsCheckParts.filter((_, i) => i !== index))
    logAudit('reject_needs_check', `تم رفض القطعة المحتاجة للفحص: ${part.part_name_ar}`, undefined, JSON.stringify(part))
  }

  const updateLabor = (index: number, field: keyof Labor, value: any) => {
    if (estimateStatus === 'confirmed') return
    const labor = labors[index]
    const oldValue = String(labor[field] || '')
    const newValue = String(value || '')

    if (oldValue === newValue) return

    const updated = [...labors]
    updated[index] = { ...updated[index], [field]: value }
    setLabors(updated)

    if (field === 'price') {
      logAudit('edit_labor', `تم تغيير السعر من ${oldValue || '0'} إلى ${newValue} للعمل ${labor.labor_name_ar}`, 'price', oldValue, newValue)
    }
  }

  const confirmEstimate = async () => {
    console.log('🔵 confirmEstimate called')
    console.log('   parts.length:', parts.length)
    console.log('   parts:', parts)
    console.log('   estimateStatus:', estimateStatus)
    if (parts.length === 0) {
      console.log('❌ No parts, showing error')
      setError('يرجى إضافة جزء واحد على الأقل')
      return
    }

    console.log('✅ Opening confirm dialog')
    setShowConfirmDialog(true)
  }

  const handleConfirmDialog = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login')
      return
    }

    // RULE: VIN is required to confirm a root estimate (supplements inherit it).
    if (!parentEstimateId && !String(vehicleInfo.vin_number || '').trim()) {
      setShowConfirmDialog(false)
      setError('رقم الشاسيه (VIN) مطلوب لتأكيد المقايسة')
      return
    }

    try {
      setConfirming(true)
      setError('')
      setShowConfirmDialog(false)

      if (estimateId === 'new') {
        const payload = {
          vehicle_year: vehicleInfo.year || 2023,
          vehicle_make: vehicleInfo.make || 'Unknown',
          vehicle_model: vehicleInfo.model || 'Unknown',
          vin_number: vehicleInfo.vin_number || null,
          customer_name: vehicleInfo.customer_name || null,
          customer_mobile: vehicleInfo.customer_mobile || null,
          insurance_company_id: vehicleInfo.insurance_company_id || null,
          parts: parts.map(p => ({ ...p, ai_original_severity: (p as any).ai_original_severity || null })),
          labors,
          status: 'confirmed',
          pricing_data: buildPricingSnapshot(),
          parent_estimate_id: parentEstimateId || null,
        }

        console.log('🚀 Sending confirmation payload:', {
          vehicle: `${payload.vehicle_make} ${payload.vehicle_model} ${payload.vehicle_year}`,
          partsCount: payload.parts.length,
          repairGroups: payload.pricing_data.repair_groups.length,
          replaceGroups: payload.pricing_data.replace_groups.length,
          partPrices: payload.pricing_data.part_prices.length,
          grandTotal: payload.pricing_data.grand_total,
          fullSnapshot: JSON.stringify(payload.pricing_data),
        })

        const response = await fetch(apiUrl('/api/estimates'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })

        console.log('📦 Response status:', response.status, response.statusText)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error('❌ API Error:', errorData)
          throw new Error(errorData.error || 'فشل إنشاء التقدير')
        }

        const data = await response.json()
        console.log('✅ Estimate created:', data)
        const createdEstimateId = data.estimate_id || data.estimate?.estimate_id

        // Upload images if any exist
        if (createdEstimateId) {
          const analysisImages = sessionStorage.getItem('analysisImages')
          console.log('🔍 Checking for analysisImages in sessionStorage:', analysisImages ? 'Found' : 'Not found')

          if (analysisImages) {
            try {
              const images = JSON.parse(analysisImages)
              console.log('📸 Uploading', images.length, 'images...')

              for (const imageBase64 of images) {
                try {
                  const formData = new FormData()
                  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
                  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

                  console.log('☁️ Cloudinary config - Cloud:', cloudName, 'Preset:', uploadPreset)

                  // Convert base64 to blob
                  const parts = imageBase64.split(',')
                  const byteCharacters = atob(parts[1])
                  const byteNumbers = new Array(byteCharacters.length)
                  for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i)
                  }
                  const byteArray = new Uint8Array(byteNumbers)
                  const blob = new Blob([byteArray], { type: 'image/jpeg' })

                  formData.append('file', blob)
                  formData.append('upload_preset', uploadPreset)

                  const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
                  console.log('📤 Uploading to:', cloudinaryUrl)

                  const cloudRes = await fetch(cloudinaryUrl, {
                    method: 'POST',
                    body: formData
                  })

                  if (cloudRes.ok) {
                    const cloudData = await cloudRes.json()
                    console.log('☁️ Cloudinary response:', cloudData.public_id)

                    // Save image reference to database
                    const dbRes = await fetch(apiUrl('/api/images'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        estimate_id: createdEstimateId,
                        cloudinary_public_id: cloudData.public_id,
                        cloudinary_url: cloudData.secure_url,
                        uploaded_by: 'workshop'
                      })
                    })

                    if (dbRes.ok) {
                      console.log('✅ Image saved to database:', cloudData.public_id)
                    } else {
                      console.error('❌ Database save failed:', await dbRes.json())
                    }
                  } else {
                    console.error('❌ Cloudinary upload failed:', cloudRes.status, await cloudRes.text())
                  }
                } catch (imgErr) {
                  console.error('💥 Error uploading single image:', imgErr)
                }
              }
              sessionStorage.removeItem('analysisImages')
            } catch (parseErr) {
              console.error('💥 Error parsing analysisImages:', parseErr)
            }
          }
        }

        setEstimateStatus('confirmed')
        setShowSuccessMessage(true)

        // Only auto-redirect if not supplementary — supplementary shows extra option
        if (!parentEstimateId) {
          setTimeout(() => {
            navigate('/dashboard')
          }, 2000)
        }
      }
    } catch (err) {
      console.error('💥 Error in handleConfirmDialog:', err)
      setError(err instanceof Error ? err.message : 'فشلت العملية')
      setShowConfirmDialog(false)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', direction: 'rtl' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{
          maxWidth: '80rem',
          margin: '0 auto',
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>تحرير التقدير</h1>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              color: '#2563eb',
              fontWeight: '500',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            ← العودة
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          padding: '2rem',
        }}>
          {error && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              backgroundColor: '#fee2e2',
              borderRight: '4px solid #ef4444',
              borderRadius: '0.5rem',
              color: '#991b1b',
              fontWeight: '500',
            }}>
              ⚠️ {error}
            </div>
          )}

          {showSuccessMessage && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1.5rem',
              backgroundColor: '#dcfce7',
              borderRight: '4px solid #16a34a',
              borderRadius: '0.5rem',
              color: '#166534',
              textAlign: 'center',
            }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: parentEstimateId ? '1rem' : 0 }}>
                ✅ تم تأكيد التقدير بنجاح!
              </div>
              {parentEstimateId && (
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => {
                      sessionStorage.setItem('supplementData', JSON.stringify({
                        parentEstimateId,
                        vehicle: {
                          year: vehicleInfo.year,
                          make: vehicleInfo.make,
                          model: vehicleInfo.model,
                          insurance_company_id: vehicleInfo.insurance_company_id || null,
                          vin_number: vehicleInfo.vin_number || null,
                          customer_name: vehicleInfo.customer_name || null,
                          customer_mobile: vehicleInfo.customer_mobile || null,
                        },
                      }))
                      navigate('/analysis')
                    }}
                    style={{ padding: '0.6rem 1.25rem', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
                  >➕ تقدير تكميلي آخر</button>
                  <button
                    onClick={() => navigate('/dashboard')}
                    style={{ padding: '0.6rem 1.25rem', background: 'white', color: '#166534', border: '1.5px solid #16a34a', borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
                  >العودة للرئيسية</button>
                </div>
              )}
            </div>
          )}

          {/* Parts Cards */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#111827' }}>قائمة الأجزاء</h2>

            {parts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {parts.map((part, idx) => (
                  <div key={idx} style={{
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <button
                        onClick={() => removePart(idx)}
                        disabled={estimateStatus === 'confirmed'}
                        style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0 }}
                      >❌</button>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '600', color: '#111827', fontSize: '0.95rem' }}>{part.part_name_ar}</div>
                        {part.confidence && (
                          <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{Math.round(part.confidence * 100)}% ثقة</div>
                        )}
                      </div>
                    </div>
                    <select
                      value={pendingLaborPick?.index === idx ? pendingLaborPick.newSeverity : part.severity_label}
                      onChange={(e) => updatePart(idx, 'severity_label', e.target.value as any)}
                      disabled={estimateStatus === 'confirmed'}
                      style={{
                        padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem',
                        textAlign: 'right', fontSize: '0.875rem', width: '90px',
                        backgroundColor: part.severity_label === 'Replace' ? '#fef2f2' : '#f0fdf4',
                        color: part.severity_label === 'Replace' ? '#dc2626' : '#16a34a',
                        fontWeight: '600', cursor: 'pointer',
                      }}
                    >
                      <option value="Repair">إصلاح</option>
                      <option value="Replace">استبدال</option>
                    </select>

                    {/* Inline labor picker for unknown parts with pending severity change */}
                    {pendingLaborPick?.index === idx && (
                      <div style={{ marginTop: '0.5rem', border: '1.5px solid #fbbf24', borderRadius: '0.5rem', overflow: 'hidden' }}>
                        <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#fffbeb', fontSize: '0.8rem', fontWeight: '700', color: '#92400e', borderBottom: '1px solid #fde68a', textAlign: 'right' }}>
                          حدد أنواع الأعمال للوضع الجديد
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', backgroundColor: 'white' }}>
                          {LABOR_TYPES.map(lt => (
                            <label key={lt.key} style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                              gap: '0.4rem', padding: '0.4rem 0.75rem', cursor: 'pointer',
                              borderBottom: '1px solid #f3f4f6', fontSize: '0.8rem',
                              backgroundColor: pendingLaborPick.selected.includes(lt.key) ? '#fffbeb' : 'white',
                              direction: 'rtl',
                            }}>
                              <span>{lt.nameAr}</span>
                              <input
                                type="checkbox"
                                checked={pendingLaborPick.selected.includes(lt.key)}
                                onChange={() => setPendingLaborPick(prev => prev ? {
                                  ...prev,
                                  selected: prev.selected.includes(lt.key)
                                    ? prev.selected.filter(k => k !== lt.key)
                                    : [...prev.selected, lt.key]
                                } : prev)}
                                style={{ width: '14px', height: '14px', accentColor: '#d97706', cursor: 'pointer' }}
                              />
                            </label>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem', backgroundColor: '#fffbeb', borderTop: '1px solid #fde68a' }}>
                          <button
                            onClick={confirmLaborPick}
                            disabled={pendingLaborPick.selected.length === 0}
                            style={{ flex: 1, padding: '0.4rem', backgroundColor: pendingLaborPick.selected.length === 0 ? '#9ca3af' : '#d97706', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: '700', fontSize: '0.8rem', cursor: pendingLaborPick.selected.length === 0 ? 'not-allowed' : 'pointer' }}
                          >تأكيد</button>
                          <button
                            onClick={() => setPendingLaborPick(null)}
                            style={{ padding: '0.4rem 0.75rem', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '0.375rem', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer' }}
                          >إلغاء</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                لا توجد أجزاء بعد
              </div>
            )}

          </div>

          {/* Needs Check Parts Section */}
          {needsCheckParts.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              {/* Red Warning Banner */}
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem 1.5rem',
                backgroundColor: '#fee2e2',
                border: '2px solid #dc2626',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}>
                <span style={{ fontSize: '2rem' }}>⚠️</span>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#991b1b', marginBottom: '0.25rem' }}>
                    أجزاء تحتاج فحص ({needsCheckParts.length})
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>
                    يرجى مراجعة الأجزاء أدناه والموافقة أو الرفض قبل تأكيد التقدير
                  </div>
                </div>
              </div>

              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#dc2626' }}>
                قائمة الأجزاء المحتاجة للفحص
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {needsCheckParts.map((part, idx) => (
                  <div key={idx} style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
                    <div style={{ textAlign: 'right', marginBottom: '0.5rem' }}>
                      <div style={{ fontWeight: '600', color: '#991b1b', fontSize: '0.95rem' }}>{part.part_name_ar}</div>
                      <div style={{ fontSize: '0.7rem', color: '#dc2626' }}>{Math.round(part.confidence * 100)}% ثقة (منخفضة)</div>
                      {part.reason_for_uncertainty && (
                        <div style={{ fontSize: '0.7rem', color: '#b91c1c', marginTop: '0.25rem' }}>{part.reason_for_uncertainty}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => approveNeedsCheckPart(idx)}
                          disabled={estimateStatus === 'confirmed'}
                          style={{ padding: '0.5rem 0.875rem', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer' }}
                        >✅ موافق</button>
                        <button
                          onClick={() => rejectNeedsCheckPart(idx)}
                          disabled={estimateStatus === 'confirmed'}
                          style={{ padding: '0.5rem 0.875rem', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '0.375rem', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer' }}
                        >❌ رفض</button>
                      </div>
                      <span style={{
                        padding: '0.25rem 0.625rem',
                        backgroundColor: part.severity_label === 'Repair' ? '#dbeafe' : '#fee2e2',
                        color: part.severity_label === 'Repair' ? '#1e40af' : '#991b1b',
                        borderRadius: '0.375rem',
                        fontWeight: '600',
                        fontSize: '0.8rem',
                      }}>
                        {part.severity_label === 'Repair' ? 'إصلاح' : 'استبدال'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Part */}
          <div style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
            border: '2px solid #e5e7eb',
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1.25rem', color: '#111827' }}>إضافة جزء جديد</h3>
            <AddPartForm
              onAdd={(part) => {
                const updated = [...parts, { ...part, is_ai_detected: false, ai_original_severity: null as any }]
                setParts(updated)
                logAudit('add_part', `تم إضافة قطعة جديدة: ${part.part_name_ar}`)
                refreshPricing(updated)
              }}
              disabled={estimateStatus === 'confirmed'}
              existingParts={parts}
            />
          </div>

          {/* Spare Parts (Replace) — editable */}
          {editablePartPrices.length > 0 && (
            <div style={{ marginBottom: '2rem', border: '1px solid #fecdd3', borderRadius: '0.6rem', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', backgroundColor: '#fff1f2', borderBottom: '1px solid #fecdd3' }}>
                <span></span>
                <span style={{ fontWeight: '700', color: '#be123c', fontSize: '1rem' }}>قطع الغيار</span>
              </div>
              {editablePartPrices.map((pp, i) => (
                <div key={pp.partId + i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: '1px solid #fef2f2', backgroundColor: i % 2 === 0 ? 'white' : '#fff9f9' }}>
                  <input
                    type="number"
                    value={pp.price || ''}
                    min="0"
                    disabled={estimateStatus === 'confirmed'}
                    onFocus={(e) => { e.target.dataset.oldPrice = e.target.value }}
                    onChange={(e) => {
                      const updated = [...editablePartPrices]
                      updated[i] = { ...updated[i], price: Math.max(0, parseFloat(e.target.value) || 0) }
                      setEditablePartPrices(updated)
                    }}
                    onBlur={(e) => {
                      const oldPrice = e.target.dataset.oldPrice || '0'
                      const newPrice = String(Math.max(0, parseFloat(e.target.value) || 0))
                      if (oldPrice !== newPrice) {
                        logAudit('price_changed', `تم تغيير سعر ${pp.part_name_ar} من ${oldPrice} إلى ${newPrice} ج.م`, 'price', oldPrice, newPrice)
                      }
                    }}
                    style={{
                      width: '100px', padding: '0.35rem 0.5rem', border: '1px solid #fecdd3',
                      borderRadius: '0.375rem', textAlign: 'center', fontSize: '0.875rem',
                      direction: 'ltr',
                    }}
                  />
                  <span style={{ color: '#374151', fontSize: '0.9rem', textAlign: 'right' }}>{pp.part_name_ar}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', backgroundColor: '#fff1f2', borderTop: '1px solid #fecdd3' }}>
                <span style={{ fontWeight: '700', color: '#be123c', fontSize: '0.95rem' }}>
                  {editablePartPrices.reduce((s, p) => s + (p.price || 0), 0).toLocaleString()} ج.م
                </span>
                <span style={{ fontWeight: '700', color: '#be123c', fontSize: '0.95rem' }}>إجمالي قطع الغيار</span>
              </div>
            </div>
          )}

          {/* Pricing Breakdown Section */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem', color: '#111827' }}>تفاصيل التكاليف</h3>

            {pricingLoading && (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '0.5rem' }}>
                ⏳ جاري احتساب التكاليف...
              </div>
            )}

            {!pricingLoading && pricingData && (() => {
              // Build unified labor map: merge repair + replace groups by labor_key
              const unifiedMap = new Map<string, {
                laborKey: string; laborNameAr: string
                repairGroup?: LaborGroup; replaceGroup?: LaborGroup
                isExtraRepair: boolean; isExtraReplace: boolean
              }>()
              pricingData.repair.groups.forEach(g => {
                unifiedMap.set(g.labor_key, { laborKey: g.labor_key, laborNameAr: g.labor_name_ar, repairGroup: g, isExtraRepair: false, isExtraReplace: false })
              })
              pricingData.replace.groups.forEach(g => {
                const ex = unifiedMap.get(g.labor_key)
                if (ex) { ex.replaceGroup = g }
                else { unifiedMap.set(g.labor_key, { laborKey: g.labor_key, laborNameAr: g.labor_name_ar, replaceGroup: g, isExtraRepair: false, isExtraReplace: false }) }
              })
              extraLaborGroups.repair.forEach(lk => {
                const lt = LABOR_TYPES.find(l => l.key === lk); if (!lt) return
                const ex = unifiedMap.get(lk)
                if (ex) { ex.isExtraRepair = true } else { unifiedMap.set(lk, { laborKey: lk, laborNameAr: lt.nameAr, isExtraRepair: true, isExtraReplace: false }) }
              })
              extraLaborGroups.replace.forEach(lk => {
                const lt = LABOR_TYPES.find(l => l.key === lk); if (!lt) return
                const ex = unifiedMap.get(lk)
                if (ex) { ex.isExtraReplace = true } else { unifiedMap.set(lk, { laborKey: lk, laborNameAr: lt.nameAr, isExtraRepair: false, isExtraReplace: true }) }
              })
              const unifiedGroups = Array.from(unifiedMap.values())

              const totalLabor =
                pricingData.repair.groups.reduce((s, g) => s + getGroupTotal(g.labor_key, g.entries, 'repair'), 0) +
                pricingData.replace.groups.reduce((s, g) => s + getGroupTotal(g.labor_key, g.entries, 'replace'), 0) +
                extraLaborGroups.repair.reduce((s, lk) => s + getExtraGroupTotal('repair', lk), 0) +
                extraLaborGroups.replace.reduce((s, lk) => s + getExtraGroupTotal('replace', lk), 0)
              const totalParts = editablePartPrices.reduce((s, p) => s + (p.price || 0), 0)

              const usedLaborKeys = new Set([
                ...pricingData.repair.groups.map(g => g.labor_key),
                ...pricingData.replace.groups.map(g => g.labor_key),
                ...extraLaborGroups.repair, ...extraLaborGroups.replace,
              ])
              const availableLaborTypes = LABOR_TYPES.filter(lt => !usedLaborKeys.has(lt.key))

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                  {/* ── المصنعيات ── */}
                  {unifiedGroups.length > 0 && (
                    <div style={{ border: '1.5px solid #ddd6fe', borderRadius: '0.75rem', overflow: 'hidden' }}>
                      {/* Section header */}
                      <div style={{ backgroundColor: '#faf5ff', padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #ddd6fe' }}>
                        <span style={{ fontWeight: '800', color: '#5b21b6', fontSize: '1rem' }}>المصنعيات</span>
                        <span style={{ fontWeight: '700', color: '#7c3aed', fontSize: '0.85rem' }}>{totalLabor.toLocaleString()} ج.م</span>
                      </div>

                      {unifiedGroups.map(({ laborKey, laborNameAr, repairGroup, replaceGroup, isExtraRepair, isExtraReplace }) => {
                        const repairTotal = repairGroup ? getGroupTotal(laborKey, repairGroup.entries, 'repair') : (isExtraRepair ? getExtraGroupTotal('repair', laborKey) : 0)
                        const replaceTotal = replaceGroup ? getGroupTotal(laborKey, replaceGroup.entries, 'replace') : (isExtraReplace ? getExtraGroupTotal('replace', laborKey) : 0)
                        const groupTotal = repairTotal + replaceTotal

                        const repManKey = `repair_${laborKey}`
                        const rplManKey = `replace_${laborKey}`
                        const repManuals = manualLaborEntries[repManKey] || []
                        const rplManuals = manualLaborEntries[rplManKey] || []

                        const hasBothSides = (!!repairGroup || isExtraRepair) && (!!replaceGroup || isExtraReplace)
                        const addType = unifiedAddType[laborKey] || (replaceGroup || isExtraReplace ? 'replace' : 'repair')
                        const activeManKey = `${addType}_${laborKey}`
                        const pendingAdd = pendingManualAdd[activeManKey] || { partName: '', costStr: '' }

                        return (
                          <div key={laborKey} style={{ borderBottom: '1px solid #ede9fe' }}>
                            {/* Group header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1.25rem', backgroundColor: '#f5f3ff' }}>
                              <span style={{ fontWeight: '700', color: '#7c3aed', fontSize: '0.88rem' }}>{groupTotal.toLocaleString()} ج.م</span>
                              <span style={{ fontWeight: '700', color: '#111827', fontSize: '0.9rem' }}>{laborNameAr}</span>
                            </div>

                            {/* Entries */}
                            <div style={{ padding: '0.35rem 1.25rem 0.6rem', backgroundColor: 'white' }}>

                              {/* Repair DB entries */}
                              {repairGroup?.entries.filter(e => !deletedEntries.has(`${laborKey}_${e.part_name_ar}`)).map((e, ei) => {
                                const ek = `${laborKey}_${e.part_name_ar}`
                                return (
                                  <div key={`r_${ei}`} style={{ display: 'flex', alignItems: 'center', padding: '0.28rem 0', fontSize: '0.8rem', color: '#6b7280', gap: '0.5rem' }}>
                                    {estimateStatus !== 'confirmed' && (
                                      <button onClick={() => setDeleteConfirm({ ek, label: e.part_name_ar })}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.7rem', padding: '0 2px', flexShrink: 0 }}>✕</button>
                                    )}
                                    <input type="number" value={editableEntryCosts[ek] ?? e.cost} min="0" disabled={estimateStatus === 'confirmed'}
                                      onChange={(e2) => setEditableEntryCosts(prev => ({ ...prev, [ek]: Math.max(0, parseFloat(e2.target.value) || 0) }))}
                                      style={{ width: '80px', padding: '0.2rem 0.4rem', border: '1px solid #ddd6fe', borderRadius: '0.375rem', textAlign: 'center', fontSize: '0.8rem', direction: 'ltr', color: '#7c3aed', flexShrink: 0 }}
                                    />
                                    <span style={{ flex: 1, textAlign: 'right' }}>{e.part_name_ar}{!e.isUnknown && ` (${e.hrs} س × ${e.hr_price} ج.م)`}</span>
                                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#f0fdf4', color: '#059669', fontWeight: '700', whiteSpace: 'nowrap' }}>إصلاح</span>
                                  </div>
                                )
                              })}

                              {/* Repair manual entries */}
                              {repManuals.map(m => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '0.28rem 0', fontSize: '0.8rem', color: '#6b7280', gap: '0.5rem' }}>
                                  {estimateStatus !== 'confirmed' && (
                                    <button onClick={() => removeManualEntry('repair', laborKey, m.id)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.7rem', padding: '0 2px', flexShrink: 0 }}>✕</button>
                                  )}
                                  <input type="number" value={m.cost} min="0" disabled={estimateStatus === 'confirmed'}
                                    onChange={(e2) => updateManualEntryCost('repair', laborKey, m.id, Math.max(0, parseFloat(e2.target.value) || 0))}
                                    style={{ width: '80px', padding: '0.2rem 0.4rem', border: '1px solid #ddd6fe', borderRadius: '0.375rem', textAlign: 'center', fontSize: '0.8rem', direction: 'ltr', color: '#7c3aed', flexShrink: 0 }}
                                  />
                                  <span style={{ flex: 1, textAlign: 'right' }}>{m.part_name_ar}</span>
                                  {hasBothSides && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#f0fdf4', color: '#059669', fontWeight: '700', whiteSpace: 'nowrap' }}>إصلاح</span>}
                                </div>
                              ))}

                              {/* Replace DB entries */}
                              {replaceGroup?.entries.filter(e => !deletedEntries.has(`${laborKey}_${e.part_name_ar}`)).map((e, ei) => {
                                const ek = `${laborKey}_${e.part_name_ar}`
                                return (
                                  <div key={`p_${ei}`} style={{ display: 'flex', alignItems: 'center', padding: '0.28rem 0', fontSize: '0.8rem', color: '#6b7280', gap: '0.5rem' }}>
                                    {estimateStatus !== 'confirmed' && (
                                      <button onClick={() => setDeleteConfirm({ ek, label: e.part_name_ar })}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.7rem', padding: '0 2px', flexShrink: 0 }}>✕</button>
                                    )}
                                    <input type="number" value={editableEntryCosts[ek] ?? e.cost} min="0" disabled={estimateStatus === 'confirmed'}
                                      onChange={(e2) => setEditableEntryCosts(prev => ({ ...prev, [ek]: Math.max(0, parseFloat(e2.target.value) || 0) }))}
                                      style={{ width: '80px', padding: '0.2rem 0.4rem', border: '1px solid #ddd6fe', borderRadius: '0.375rem', textAlign: 'center', fontSize: '0.8rem', direction: 'ltr', color: '#7c3aed', flexShrink: 0 }}
                                    />
                                    <span style={{ flex: 1, textAlign: 'right' }}>{e.part_name_ar}{!e.isUnknown && ` (${e.hrs} س × ${e.hr_price} ج.م)`}</span>
                                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#fef2f2', color: '#dc2626', fontWeight: '700', whiteSpace: 'nowrap' }}>استبدال</span>
                                  </div>
                                )
                              })}

                              {/* Replace manual entries */}
                              {rplManuals.map(m => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '0.28rem 0', fontSize: '0.8rem', color: '#6b7280', gap: '0.5rem' }}>
                                  {estimateStatus !== 'confirmed' && (
                                    <button onClick={() => removeManualEntry('replace', laborKey, m.id)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.7rem', padding: '0 2px', flexShrink: 0 }}>✕</button>
                                  )}
                                  <input type="number" value={m.cost} min="0" disabled={estimateStatus === 'confirmed'}
                                    onChange={(e2) => updateManualEntryCost('replace', laborKey, m.id, Math.max(0, parseFloat(e2.target.value) || 0))}
                                    style={{ width: '80px', padding: '0.2rem 0.4rem', border: '1px solid #ddd6fe', borderRadius: '0.375rem', textAlign: 'center', fontSize: '0.8rem', direction: 'ltr', color: '#7c3aed', flexShrink: 0 }}
                                  />
                                  <span style={{ flex: 1, textAlign: 'right' }}>{m.part_name_ar}</span>
                                  {hasBothSides && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#fef2f2', color: '#dc2626', fontWeight: '700', whiteSpace: 'nowrap' }}>استبدال</span>}
                                </div>
                              ))}

                              {/* Add entry row */}
                              {estimateStatus !== 'confirmed' && (
                                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #ede9fe' }}>
                                  <button
                                    onClick={() => {
                                      if (!pendingAdd.partName) return
                                      const cost = parseFloat(pendingAdd.costStr || '0') || 0
                                      setManualLaborEntries(prev => ({
                                        ...prev,
                                        [activeManKey]: [...(prev[activeManKey] || []), { id: Date.now().toString(), part_name_ar: pendingAdd.partName, cost }]
                                      }))
                                      setPendingManualAdd(prev => ({ ...prev, [activeManKey]: { partName: '', costStr: '' } }))
                                    }}
                                    style={{ padding: '0.25rem 0.6rem', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}>➕</button>
                                  {hasBothSides && (
                                    <select value={addType}
                                      onChange={(e2) => setUnifiedAddType(prev => ({ ...prev, [laborKey]: e2.target.value as 'repair' | 'replace' }))}
                                      style={{ width: '72px', padding: '0.22rem 0.3rem', border: '1px solid #ddd6fe', borderRadius: '0.375rem', fontSize: '0.72rem', textAlign: 'right', color: addType === 'repair' ? '#059669' : '#dc2626', fontWeight: '700', flexShrink: 0 }}>
                                      <option value="repair">إصلاح</option>
                                      <option value="replace">استبدال</option>
                                    </select>
                                  )}
                                  <input type="text" inputMode="numeric" value={pendingAdd.costStr ?? ''} placeholder="التكلفة"
                                    onChange={(e2) => setPendingManualAdd(prev => ({ ...prev, [activeManKey]: { ...pendingAdd, costStr: e2.target.value } }))}
                                    style={{ width: '70px', padding: '0.22rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', textAlign: 'center', fontSize: '0.75rem', direction: 'ltr', flexShrink: 0 }}
                                  />
                                  <select value={pendingAdd.partName}
                                    onChange={(e2) => setPendingManualAdd(prev => ({ ...prev, [activeManKey]: { ...pendingAdd, partName: e2.target.value } }))}
                                    style={{ flex: 1, padding: '0.22rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.75rem', textAlign: 'right', direction: 'rtl' }}>
                                    <option value="">-- اختر جزء --</option>
                                    {parts.map((p, pi) => <option key={pi} value={p.part_name_ar}>{p.part_name_ar}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* Add new labor type */}
                      {estimateStatus !== 'confirmed' && availableLaborTypes.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.25rem', alignItems: 'center', backgroundColor: '#faf5ff', borderTop: '1px solid #ede9fe' }}>
                          <button
                            onClick={() => {
                              if (!pendingLaborNewKey) return
                              setExtraLaborGroups(prev => ({ ...prev, repair: [...prev.repair, pendingLaborNewKey] }))
                              setPendingLaborNewKey('')
                            }}
                            disabled={!pendingLaborNewKey}
                            style={{ padding: '0.35rem 0.9rem', backgroundColor: pendingLaborNewKey ? '#7c3aed' : '#9ca3af', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.8rem', fontWeight: '700', cursor: pendingLaborNewKey ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                            + إضافة عمل
                          </button>
                          <select value={pendingLaborNewKey} onChange={(e) => setPendingLaborNewKey(e.target.value)}
                            style={{ flex: 1, padding: '0.35rem 0.5rem', border: '1px solid #ddd6fe', borderRadius: '0.375rem', fontSize: '0.8rem', textAlign: 'right', direction: 'rtl' }}>
                            <option value="">-- اختر نوع العمل --</option>
                            {availableLaborTypes.map(lt => <option key={lt.key} value={lt.key}>{lt.nameAr}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Grand Total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 1.25rem', backgroundColor: '#1e3a8a', borderRadius: '0.6rem', color: 'white', fontWeight: '800', fontSize: '1.05rem' }}>
                    <span>{(totalLabor + totalParts).toLocaleString()} ج.م</span>
                    <span>الإجمالي الكلي</span>
                  </div>
                </div>
              )
            })()}

            {!pricingLoading && !pricingData && labors.length > 0 && (
              <div style={{ border: '1.5px solid #e5e7eb', borderRadius: '0.6rem', overflow: 'hidden' }}>
                {labors.map((labor, idx) => (
                  <div key={labor.id || idx} style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: '1px solid #f3f4f6' }}>
                    <input
                      type="number"
                      value={labor.price || ''}
                      onChange={(e) => updateLabor(idx, 'price', Math.max(0, parseFloat(e.target.value) || 0))}
                      disabled={estimateStatus === 'confirmed'}
                      placeholder="0"
                      min="0"
                      style={{ width: '90px', flexShrink: 0, padding: '0.4rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', textAlign: 'center', fontSize: '0.875rem' }}
                    />
                    <span style={{ flex: 1, color: '#374151', fontWeight: '500', fontSize: '0.875rem', textAlign: 'right', paddingRight: '0.75rem' }}>{labor.labor_name_ar}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={confirmEstimate}
              disabled={confirming || parts.length === 0 || estimateStatus === 'confirmed'}
              style={{
                flex: 1,
                padding: '1rem 1.5rem',
                backgroundColor: confirming || parts.length === 0 || estimateStatus === 'confirmed' ? '#9ca3af' : '#2563eb',
                color: 'white',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                fontSize: '1.125rem',
                border: 'none',
                cursor: confirming || parts.length === 0 || estimateStatus === 'confirmed' ? 'not-allowed' : 'pointer',
              }}
            >
              {estimateStatus === 'confirmed' ? '✅ مؤكد' : confirming ? '⏳ جاري...' : '✅ تأكيد التقدير'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '1rem 1.5rem',
                border: '2px solid #d1d5db',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              ← إلغاء
            </button>
          </div>

          {/* Delete Labor Entry Confirmation */}
          {deleteConfirm && (
            <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '1.5rem', maxWidth: '360px', width: '90%', direction: 'rtl', textAlign: 'right' }}>
                <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: '700', color: '#111827' }}>تأكيد الحذف</h3>
                <p style={{ margin: '0 0 1.25rem', color: '#6b7280', fontSize: '0.9rem' }}>
                  هل تريد حذف <strong>{deleteConfirm.label}</strong> من هذا العمل؟
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-start' }}>
                  <button
                    onClick={() => {
                      setDeletedEntries(prev => new Set([...prev, deleteConfirm.ek]))
                      setDeleteConfirm(null)
                    }}
                    style={{ padding: '0.5rem 1.25rem', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '700', cursor: 'pointer' }}
                  >حذف</button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    style={{ padding: '0.5rem 1.25rem', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer' }}
                  >إلغاء</button>
                </div>
              </div>
            </div>
          )}

          {/* Remove Part Confirmation Dialog */}
          {showRemoveDialog && (
            <div style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
            }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '0.75rem',
                padding: '2rem',
                maxWidth: '400px',
                width: '90%',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#111827' }}>
                  تأكيد الحذف
                </h3>
                <p style={{ color: '#6b7280', marginBottom: '2rem', lineHeight: 1.6 }}>
                  هل أنت متأكد من حذف <strong style={{ color: '#dc2626' }}>{showRemoveDialog.partName}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
                </p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={confirmRemovePart}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#dc2626',
                      color: 'white',
                      borderRadius: '0.5rem',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    حذف
                  </button>
                  <button
                    onClick={() => setShowRemoveDialog(null)}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      backgroundColor: 'white',
                      color: '#6b7280',
                      border: '2px solid #d1d5db',
                      borderRadius: '0.5rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Confirmation Dialog */}
          {showConfirmDialog && (
            <div style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
            }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '0.75rem',
                padding: '2rem',
                maxWidth: '400px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#111827' }}>
                  تأكيد التقدير
                </h3>
                <p style={{ color: '#6b7280', marginBottom: '2rem', lineHeight: 1.6 }}>
                  بعد التأكيد لن تتمكن من تعديل أي بيانات
                </p>
                <div style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: pricingData ? '#dcfce7' : '#fef3c7',
                  borderRight: `4px solid ${pricingData ? '#16a34a' : '#f59e0b'}`,
                  borderRadius: '0.375rem',
                  marginBottom: '1.5rem',
                  fontSize: '0.875rem',
                }}>
                  {pricingData ? (
                    <span style={{ color: '#166534' }}>✅ بيانات التسعير محملة</span>
                  ) : (
                    <span style={{ color: '#92400e' }}>⚠️ بيانات التسعير غير محملة بعد</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={handleConfirmDialog}
                    disabled={confirming}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      backgroundColor: confirming ? '#9ca3af' : '#2563eb',
                      color: 'white',
                      borderRadius: '0.5rem',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: confirming ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {confirming ? '⏳ جاري...' : 'تأكيد'}
                  </button>
                  <button
                    onClick={() => setShowConfirmDialog(false)}
                    disabled={confirming}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1.5rem',
                      backgroundColor: 'white',
                      color: '#6b7280',
                      border: '2px solid #d1d5db',
                      borderRadius: '0.5rem',
                      fontWeight: 'bold',
                      cursor: confirming ? 'not-allowed' : 'pointer',
                    }}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

type PricingType = 'repair' | 'replace'

// The nine labor-hour fields, with Arabic labels (mirrors server LABOR_TYPES).
const HOUR_FIELDS: { key: string; label: string }[] = [
  { key: 'refitting_labor_hrs', label: 'فك و تركيب' },
  { key: 'dent_hrs',            label: 'سمكرة' },
  { key: 'paint_hrs',           label: 'دهان' },
  { key: 'elec_hrs',            label: 'كهربا' },
  { key: 'intr_hrs',            label: 'سروجي' },
  { key: 'cooling_hrs',         label: 'تبريد' },
  { key: 'susp_hrs',            label: 'عفشة و زوايا' },
  { key: 'mechanical_hrs',      label: 'ميكانيكا' },
  { key: 'glass_hrs',           label: 'زجاج' },
]

interface Row {
  part_id: string
  part_number?: string | null
  part_name_ar?: string | null
  part_name_en?: string | null
  vehicle_make: string
  vehicle_model: string
  vehicle_year?: string | null
  hr_price_egp?: number | null
  part_price?: number | null
  overridden: Record<string, boolean>
  total_repair_hrs: number
  total_cost: number
  [k: string]: any
}

const editableFields = (type: PricingType) =>
  type === 'replace'
    ? [...HOUR_FIELDS.map(h => h.key), 'hr_price_egp', 'part_price']
    : [...HOUR_FIELDS.map(h => h.key), 'hr_price_egp']

const emptyFilters = { make: '', model: '', year: '', part_name: '', part_id: '', part_number: '' }

export default function PricingPage() {
  const navigate = useNavigate()

  // --- step-up auth gate: single-use admin code → short-lived pricing token ---
  const [authed, setAuthed] = useState(!!sessionStorage.getItem('pricing_token'))
  const [code, setCode] = useState('')
  const [stepUpBusy, setStepUpBusy] = useState(false)
  const [stepUpError, setStepUpError] = useState('')

  const [tab, setTab] = useState<PricingType>('repair')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ ...emptyFilters })
  const [dropdowns, setDropdowns] = useState<{ makes: string[]; models: string[]; years: string[] }>({ makes: [], models: [], years: [] })
  const [editing, setEditing] = useState<{ key: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [toast, setToast] = useState('')
  const [uploadResult, setUploadResult] = useState<null | { upserted: number; failed: number; total: number; invalid: any[] }>(null)
  const [uploading, setUploading] = useState(false)

  const rowKey = (r: Row) => `${r.part_id}|${r.vehicle_make}|${r.vehicle_model}|${r.vehicle_year ?? ''}`
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }
  // Data routes require the pricing-scoped token from step-up.
  const token = () => sessionStorage.getItem('pricing_token') || ''

  // If a data call is rejected for step-up (expired/invalid), re-gate.
  const guard = (res: Response) => {
    if (res.status === 403 || res.status === 401) {
      sessionStorage.removeItem('pricing_token')
      setAuthed(false)
      setStepUpError('انتهت الجلسة. أدخل رمز دخول جديد.')
      return false
    }
    return true
  }

  const redeemCode = async () => {
    const c = code.trim()
    if (!c) { setStepUpError('أدخل رمز الدخول'); return }
    setStepUpBusy(true); setStepUpError('')
    try {
      const res = await fetch(apiUrl('/api/workshop-pricing/step-up'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ code: c }),
      })
      const d = await res.json()
      if (res.ok && d.success && d.pricingToken) {
        sessionStorage.setItem('pricing_token', d.pricingToken)
        setCode('')
        setAuthed(true)
      } else {
        setStepUpError(d.error || 'رمز غير صالح')
      }
    } catch {
      setStepUpError('تعذّر التحقق من الرمز')
    } finally {
      setStepUpBusy(false)
    }
  }

  const loadFilters = useCallback(async (type: PricingType) => {
    try {
      const res = await fetch(apiUrl(`/api/workshop-pricing/${type}/filters`), { headers: { Authorization: `Bearer ${token()}` } })
      const d = await res.json()
      if (d.success) setDropdowns({ makes: d.makes || [], models: d.models || [], years: d.years || [] })
    } catch { /* ignore */ }
  }, [])

  const load = useCallback(async (type: PricingType, f = filters) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (f.make) qs.set('make', f.make)
      if (f.model) qs.set('model', f.model)
      if (f.year) qs.set('year', f.year)
      if (f.part_name) qs.set('part_name', f.part_name)
      if (f.part_id) qs.set('part_id', f.part_id)
      if (f.part_number) qs.set('part_number', f.part_number)
      const res = await fetch(apiUrl(`/api/workshop-pricing/${type}?${qs.toString()}`), { headers: { Authorization: `Bearer ${token()}` } })
      if (!guard(res)) { setRows([]); return }
      const d = await res.json()
      setRows(d.success ? d.rows : [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    if (!authed) return
    loadFilters(tab)
    load(tab, filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authed])

  const applyFilters = () => load(tab, filters)
  const clearFilters = () => { const f = { ...emptyFilters }; setFilters(f); load(tab, f) }

  // ---- inline edit → saves immediately (no resync step) ----
  const startEdit = (r: Row, field: string) => {
    setEditing({ key: rowKey(r), field })
    const v = r[field]
    setEditValue(v === null || v === undefined ? '' : String(v))
  }

  const commitEdit = async (r: Row, field: string) => {
    const value = editValue.trim()
    setEditing(null)
    if (value === '' || !Number.isFinite(Number(value))) { showToast('⚠ ادخل رقماً صحيحاً'); return }
    if (String(r[field] ?? '') === value) return // unchanged
    try {
      const res = await fetch(apiUrl(`/api/workshop-pricing/${tab}/override`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          part_id: r.part_id, vehicle_make: r.vehicle_make, vehicle_model: r.vehicle_model,
          vehicle_year: r.vehicle_year ?? null, field, value: Number(value),
        }),
      })
      const d = await res.json()
      if (d.success && d.row) {
        setRows(prev => prev.map(x => rowKey(x) === rowKey(r) ? d.row : x))
        showToast('✓ تم الحفظ')
      } else { showToast('⚠ تعذّر الحفظ') }
    } catch { showToast('⚠ تعذّر الحفظ') }
  }

  const resetField = async (r: Row, field: string) => {
    try {
      const res = await fetch(apiUrl(`/api/workshop-pricing/${tab}/override`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          part_id: r.part_id, vehicle_make: r.vehicle_make, vehicle_model: r.vehicle_model,
          vehicle_year: r.vehicle_year ?? null, field,
        }),
      })
      const d = await res.json()
      if (d.success && d.row) {
        setRows(prev => prev.map(x => rowKey(x) === rowKey(r) ? d.row : x))
        showToast('✓ رجع للقيمة المرفوعة')
      } else { showToast('⚠ تعذّر الاسترجاع') }
    } catch { showToast('⚠ تعذّر الاسترجاع') }
  }

  // ---- CSV upload ----
  const onCsvSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting same file
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    try {
      const csv = await file.text()
      const res = await fetch(apiUrl(`/api/workshop-pricing/${tab}/upload`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ csv }),
      })
      const d = await res.json()
      if (d.success) {
        setUploadResult(d)
        showToast(`✓ تم رفع ${d.upserted} صف` + (d.failed ? ` — فشل ${d.failed}` : ''))
        load(tab, filters)
        loadFilters(tab)
      } else {
        showToast('⚠ ' + (d.error || 'تعذّر رفع الملف'))
      }
    } catch { showToast('⚠ تعذّر رفع الملف') }
    finally { setUploading(false) }
  }

  const fields = editableFields(tab)

  // ================= step-up auth gate =================
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'white', padding: '2rem', borderRadius: '0.75rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: 380, textAlign: 'center' }}>
          <h2 style={{ marginTop: 0, color: '#111827' }}>🔒 تأكيد الدخول</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>هذا القسم محمي. أدخل رمز الدخول لمرة واحدة الذي حصلت عليه من الإدارة.</p>
          <input
            autoFocus
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') redeemCode() }}
            placeholder="رمز الدخول"
            style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', marginBottom: '0.75rem', textAlign: 'center', letterSpacing: '0.15em', fontWeight: 700, boxSizing: 'border-box' }}
          />
          {stepUpError && <p style={{ color: '#dc2626', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>{stepUpError}</p>}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={redeemCode}
              disabled={stepUpBusy}
              style={{ flex: 1, padding: '0.6rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 700, cursor: stepUpBusy ? 'wait' : 'pointer', opacity: stepUpBusy ? 0.7 : 1 }}
            >{stepUpBusy ? '… جارٍ التحقق' : 'دخول'}</button>
            <button
              onClick={() => navigate('/dashboard')}
              style={{ flex: 1, padding: '0.6rem', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer' }}
            >رجوع</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', direction: 'rtl' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100, padding: '0.6rem 1.2rem', borderRadius: '0.5rem', color: 'white', fontWeight: 700, background: toast.startsWith('✓') ? '#16a34a' : '#dc2626' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#2563eb', margin: 0 }}>قائمة الأسعار</h1>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '0.5rem 1.25rem', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.5rem', cursor: 'pointer' }}>← الرجوع للوحة</button>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {(['repair', 'replace'] as PricingType[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setUploadResult(null) }}
              style={{
                padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontWeight: 700,
                background: tab === t ? '#2563eb' : 'white', color: tab === t ? 'white' : '#374151',
                boxShadow: tab === t ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >{t === 'repair' ? 'اعمال الاصلاح' : 'قطع الغيار'}</button>
          ))}
        </div>

        {/* Filters + CSV */}
        <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <select value={filters.make} onChange={e => setFilters(f => ({ ...f, make: e.target.value }))} style={selStyle}>
              <option value="">كل الماركات</option>
              {dropdowns.makes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={filters.model} onChange={e => setFilters(f => ({ ...f, model: e.target.value }))} style={selStyle}>
              <option value="">كل الموديلات</option>
              {dropdowns.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))} style={selStyle}>
              <option value="">كل السنوات</option>
              {dropdowns.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <input placeholder="اسم القطعة" value={filters.part_name} onChange={e => setFilters(f => ({ ...f, part_name: e.target.value }))} style={inpStyle} />
            <input placeholder="كود القطعة" value={filters.part_id} onChange={e => setFilters(f => ({ ...f, part_id: e.target.value }))} style={inpStyle} />
            <input placeholder="رقم القطعة" value={filters.part_number} onChange={e => setFilters(f => ({ ...f, part_number: e.target.value }))} style={inpStyle} />
            <button onClick={applyFilters} style={{ ...btnStyle, background: '#2563eb', color: 'white' }}>بحث</button>
            <button onClick={clearFilters} style={{ ...btnStyle, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}>مسح</button>

            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: '0.5rem' }}>
              <label style={{ ...btnStyle, background: '#16a34a', color: 'white', cursor: uploading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                {uploading ? '… جارٍ الرفع' : '⬆ رفع ملف CSV'}
                <input type="file" accept=".csv,text/csv" onChange={onCsvSelected} disabled={uploading} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          {uploadResult && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '0.5rem', background: uploadResult.failed ? '#fffbeb' : '#f0fdf4', border: `1px solid ${uploadResult.failed ? '#fde68a' : '#bbf7d0'}` }}>
              <div style={{ fontWeight: 700, marginBottom: uploadResult.invalid?.length ? '0.5rem' : 0 }}>
                تم تحديث {uploadResult.upserted} صف من {uploadResult.total}
                {uploadResult.failed ? ` — فشل ${uploadResult.failed} صف` : ' ✓'}
              </div>
              {uploadResult.invalid?.length > 0 && (
                <div style={{ maxHeight: 160, overflow: 'auto', fontSize: '0.8rem' }}>
                  {uploadResult.invalid.map((iv, i) => (
                    <div key={i} style={{ color: '#b45309', padding: '0.15rem 0' }}>
                      صف {iv.row_number}: {iv.reason}
                    </div>
                  ))}
                  <div style={{ color: '#9ca3af', marginTop: '0.25rem' }}>الصفوف الفاشلة سُجّلت لمراجعة الإدارة.</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: '0.75rem', overflow: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>… جارٍ التحميل</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>لا توجد بيانات — ارفع ملف CSV للبدء.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={thStyle}>كود</th>
                  <th style={thStyle}>رقم القطعة</th>
                  <th style={thStyle}>الاسم</th>
                  <th style={thStyle}>الماركة</th>
                  <th style={thStyle}>الموديل</th>
                  <th style={thStyle}>السنة</th>
                  {HOUR_FIELDS.map(h => <th key={h.key} style={thStyle}>{h.label}</th>)}
                  <th style={thStyle}>سعر الساعة</th>
                  {tab === 'replace' && <th style={thStyle}>سعر القطعة</th>}
                  <th style={{ ...thStyle, background: '#eff6ff' }}>إجمالي الساعات</th>
                  <th style={{ ...thStyle, background: '#eff6ff' }}>الإجمالي (ج.م)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={rowKey(r)} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>{r.part_id}</td>
                    <td style={tdStyle}>{r.part_number || '—'}</td>
                    <td style={tdStyle}>{r.part_name_ar || r.part_name_en || '—'}</td>
                    <td style={tdStyle}>{r.vehicle_make}</td>
                    <td style={tdStyle}>{r.vehicle_model}</td>
                    <td style={tdStyle}>{r.vehicle_year || '—'}</td>
                    {fields.map(field => {
                      const isEditing = editing && editing.key === rowKey(r) && editing.field === field
                      const overridden = !!r.overridden?.[field]
                      const val = r[field]
                      return (
                        <td key={field} style={{ ...tdStyle, position: 'relative', background: overridden ? '#fffbeb' : undefined, cursor: 'pointer' }}
                            title={overridden ? 'قيمة معدّلة يدوياً' : 'اضغط للتعديل'}>
                          {isEditing ? (
                            <input
                              autoFocus
                              type="number"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(r, field)}
                              onKeyDown={e => { if (e.key === 'Enter') commitEdit(r, field); if (e.key === 'Escape') setEditing(null) }}
                              style={{ width: 64, padding: '0.2rem', border: '1px solid #2563eb', borderRadius: 4, textAlign: 'center' }}
                            />
                          ) : (
                            <span onClick={() => startEdit(r, field)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {overridden && <span style={{ color: '#d97706' }}>✎</span>}
                              {val === null || val === undefined ? '—' : val}
                              {overridden && (
                                <button
                                  onClick={e => { e.stopPropagation(); resetField(r, field) }}
                                  title="استرجاع القيمة المرفوعة"
                                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.8rem', padding: 0 }}
                                >↺</button>
                              )}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td style={{ ...tdStyle, background: '#eff6ff', fontWeight: 700 }}>{r.total_repair_hrs}</td>
                    <td style={{ ...tdStyle, background: '#eff6ff', fontWeight: 700 }}>{r.total_cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

const selStyle: React.CSSProperties = { padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.85rem' }
const inpStyle: React.CSSProperties = { padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.85rem', width: 120 }
const btnStyle: React.CSSProperties = { padding: '0.45rem 1rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }
const thStyle: React.CSSProperties = { padding: '0.6rem 0.5rem', textAlign: 'center', fontWeight: 700, color: '#374151', borderInlineEnd: '1px solid #f3f4f6' }
const tdStyle: React.CSSProperties = { padding: '0.5rem', textAlign: 'center', color: '#111827', borderInlineEnd: '1px solid #f9fafb' }

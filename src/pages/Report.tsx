import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

type EstimateStatus = 'draft' | 'confirmed' | 'approved_by_insurance' | 'rejected_by_insurance' | 'counter_offer' | 'workshop_revised' | 'workshop_accepted' | 'settled'

interface LaborGroup { labor_name_ar: string; total: number; parts: string[] }
interface PartPrice { part_name_ar: string; price: number }
interface PricingData {
  repair_groups: LaborGroup[]
  replace_groups: LaborGroup[]
  part_prices: PartPrice[]
  total_repair: number
  total_replace_labor: number
  total_parts: number
  grand_total: number
}

interface ChainItem {
  estimate_id: string
  status: EstimateStatus
  confirmed_at?: string
  created_at: string
  parent_estimate_id?: string | null
  pricing_data?: PricingData | null
}

interface ReportData {
  estimate_id: string
  vehicle_year: number
  vehicle_make: string
  vehicle_model: string
  vin_number?: string
  customer_name?: string
  customer_mobile?: string
  insurance_company_id?: string
  confirmed_at: string
  status: EstimateStatus
  parent_estimate_id?: string | null
  pricing_data?: PricingData
  workshop: { workshop_name: string; city: string; phone: string }
}

const STATUS_CONFIG: Record<EstimateStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:                  { label: 'مسودة',            color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  confirmed:              { label: 'أُرسل للتأمين',    color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  approved_by_insurance:  { label: 'موافقة التأمين',   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  rejected_by_insurance:  { label: 'رفض التأمين',      color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  counter_offer:          { label: 'عرض مضاد',                        color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  workshop_revised:       { label: 'تم الرد — بانتظار التأمين',       color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  workshop_accepted:      { label: 'وافقت على العرض — بانتظار التأمين', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  settled:                { label: 'تمت التسوية',       color: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
}

export default function ReportPage() {
  const { estimateId } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState<ReportData | null>(null)
  const [chain, setChain] = useState<ChainItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)

  useEffect(() => { loadReport() }, [estimateId])

  const loadReport = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/api/estimates/${estimateId}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('فشل تحميل التقرير')
      const data = await response.json()
      const workshopData = JSON.parse(localStorage.getItem('workshop') || '{}')
      setReport({
        ...data.estimate,
        workshop: {
          workshop_name: workshopData.workshop_name || 'ورشة',
          city: workshopData.city || '-',
          phone: workshopData.phone || '-',
        },
      })
      setChain(data.chain || [])
      setShareUrl(`${window.location.origin}/report/${estimateId}?public=true`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحميل التقرير')
    } finally {
      setLoading(false)
    }
  }

  const advanceStatus = async (newStatus: EstimateStatus) => {
    if (!report) return
    setStatusUpdating(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/api/estimates/${estimateId}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('فشل تحديث الحالة')
      const data = await res.json()
      setReport(prev => prev ? { ...prev, status: data.estimate.status } : prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحديث الحالة')
    } finally {
      setStatusUpdating(false)
    }
  }

  const createSupplement = () => {
    if (!report) return
    // Store supplement context in sessionStorage — Estimate page reads it
    sessionStorage.setItem('supplementData', JSON.stringify({
      parentEstimateId: report.estimate_id,
      vehicle: {
        make: report.vehicle_make,
        model: report.vehicle_model,
        year: report.vehicle_year,
        vin_number: report.vin_number,
        customer_name: report.customer_name,
        customer_mobile: report.customer_mobile,
        insurance_company_id: report.insurance_company_id,
      },
    }))
    navigate('/estimate/new')
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', direction: 'rtl' }}>
      <p style={{ color: '#4b5563' }}>⏳ جاري تحميل التقرير...</p>
    </div>
  )

  if (error || !report) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', direction: 'rtl' }}>
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '0.75rem', textAlign: 'center' }}>
        <p style={{ color: '#991b1b', marginBottom: '1rem' }}>❌ {error || 'لا يوجد تقرير'}</p>
        <button onClick={() => navigate('/dashboard')} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#2563eb', color: 'white', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>← العودة للتقديرات</button>
      </div>
    </div>
  )

  const pd = report.pricing_data

  const sectionTitle = (title: string) => (
    <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1e3a8a', margin: '0 0 1rem 0', paddingBottom: '0.6rem', borderBottom: '2px solid #1e3a8a' }}>{title}</h3>
  )

  const totalBox = (label: string, amount: number, color = '#1e3a8a', bg = '#eff6ff') => (
    <div style={{ padding: '0.875rem 1rem', backgroundColor: bg, borderRight: `4px solid ${color}`, borderRadius: '0.375rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
      <span style={{ fontWeight: 'bold', color, fontSize: '0.95rem' }}>{label}</span>
      <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color }}>{(amount || 0).toLocaleString()} ج.م</span>
    </div>
  )

  const infoField = (label: string, value: string) => (
    <div style={{ marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid #e5e7eb' }}>
      <p style={{ color: '#6b7280', margin: '0 0 0.4rem 0', fontWeight: 'bold', fontSize: '0.85rem' }}>{label}</p>
      <p style={{ color: '#111827', margin: 0, fontWeight: '600' }}>{value}</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', padding: '0.5rem 0.25rem', direction: 'rtl' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', overflow: 'hidden', padding: '1rem 0.75rem' }}>

          {/* ── HEADER ── */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem', borderBottom: '3px solid #1e3a8a', paddingBottom: '1rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0 0 0.5rem', color: '#1e3a8a' }}>مقايسة إصلاح</h1>
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#6b7280' }}>التاريخ : {formatDate(report.confirmed_at)}</p>
          </div>

          {/* ── WORKSHOP & VEHICLE INFO ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
            <div style={{ textAlign: 'right' }}>
              {infoField('اسم الورشه', report.workshop.workshop_name)}
              {infoField('العنوان', report.workshop.city)}
              {infoField('التليفون', report.workshop.phone)}
            </div>
            <div style={{ textAlign: 'right' }}>
              {infoField('ماركة السيارة', report.vehicle_make)}
              {infoField('الموديل', report.vehicle_model)}
              {infoField('سنه الصنع', String(report.vehicle_year))}
            </div>
          </div>

          {/* ── CUSTOMER INFO ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem', fontSize: '0.9rem', paddingBottom: '1rem', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ textAlign: 'right' }}>
              {report.customer_name && infoField('اسم العميل', report.customer_name)}
              {report.customer_mobile && infoField('رقم الهاتف', report.customer_mobile)}
            </div>
            <div style={{ textAlign: 'right' }}>
              {report.vin_number && infoField('رقم الشاسيه (VIN)', report.vin_number)}
              {report.insurance_company_id && infoField('شركة التأمين', report.insurance_company_id.toUpperCase())}
            </div>
          </div>


          {/* ── CHAIN TIMELINE ── */}
          {chain.length > 1 && (
            <div style={{ marginBottom: '2rem', padding: '1rem 1.25rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.6rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.75rem' }}>سلسلة المقايسات</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {chain.map((item, idx) => {
                  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.confirmed
                  const isThis = item.estimate_id === estimateId
                  const isSupplement = !!item.parent_estimate_id
                  return (
                    <div
                      key={item.estimate_id}
                      onClick={() => !isThis && navigate(`/report/${item.estimate_id}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.55rem 0.75rem', borderRadius: '0.4rem',
                        backgroundColor: isThis ? cfg.bg : 'white',
                        border: isThis ? `1.5px solid ${cfg.border}` : '1px solid #e5e7eb',
                        cursor: isThis ? 'default' : 'pointer',
                        marginRight: isSupplement ? '1.5rem' : '0',
                      }}
                    >
                      {isSupplement && <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>↳</span>}
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600', minWidth: '18px', textAlign: 'center' }}>{idx + 1}</span>
                      {item.status !== 'confirmed' && <span style={{ fontSize: '0.78rem', fontWeight: '700', color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '999px', padding: '0.1rem 0.55rem' }}>{cfg.label}</span>}
                      <span style={{ fontSize: '0.78rem', color: '#64748b', flex: 1 }}>
                        {isSupplement ? 'تكميلية' : 'أصلية'} • {new Date(item.created_at).toLocaleDateString('ar-EG')}
                      </span>
                      {isThis && <span style={{ fontSize: '0.72rem', color: cfg.color, fontWeight: '700' }}>← الحالية</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {pd && (pd.part_prices.length > 0 || pd.repair_groups.length > 0 || pd.replace_groups.length > 0) ? (
            <>
              {/* ── 1. قطع الغيار ── */}
              {pd.part_prices.length > 0 && (
                <div style={{ marginBottom: '2.5rem' }}>
                  {sectionTitle('قطع الغيار')}
                  <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #1e3a8a' }}>
                        <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#1e3a8a', textAlign: 'center', width: '40px' }}>م</th>
                        <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#1e3a8a', textAlign: 'right' }}>قطع الغيار</th>
                        <th style={{ padding: '0.75rem', fontWeight: 'bold', color: '#1e3a8a', textAlign: 'center', width: '120px' }}>السعر (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pd.part_prices.map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: '#6b7280' }}>{i + 1}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#111827' }}>{p.part_name_ar}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: '#111827', fontWeight: '600' }}>{p.price.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalBox('إجمالى تكلفة قطع الغيار', pd.total_parts)}
                </div>
              )}

              {/* ── 2. المصنعيات (merged repair + replace labor groups) ── */}
              {(pd.repair_groups.length > 0 || pd.replace_groups.length > 0) && (() => {
                const merged = new Map<string, { parts: string[]; total: number }>()
                ;[...pd.repair_groups, ...pd.replace_groups].forEach(g => {
                  const existing = merged.get(g.labor_name_ar)
                  if (existing) {
                    existing.parts = [...existing.parts, ...g.parts]
                    existing.total += g.total
                  } else {
                    merged.set(g.labor_name_ar, { parts: [...g.parts], total: g.total })
                  }
                })
                const rows = Array.from(merged.entries())
                const totalLabor = rows.reduce((s, [, v]) => s + v.total, 0)
                return (
                  <div style={{ marginBottom: '2.5rem' }}>
                    {sectionTitle('المصنعيات')}
                    <div style={{ border: '1px solid #ede9fe', borderRadius: '0.5rem', overflow: 'hidden' }}>
                      {rows.map(([name, val], i) => (
                        <div key={i} style={{ padding: '0.75rem 1rem', borderBottom: i < rows.length - 1 ? '1px solid #ede9fe' : 'none', backgroundColor: i % 2 === 0 ? '#faf5ff' : 'white' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem' }}>
                            <span style={{ fontWeight: '700', color: '#5b21b6', fontSize: '0.95rem' }}>{name}</span>
                            <span style={{ fontWeight: '700', color: '#7c3aed', whiteSpace: 'nowrap', fontSize: '0.95rem' }}>{val.total.toLocaleString()} ج.م</span>
                          </div>
                          {val.parts.length > 0 && (
                            <div style={{ marginTop: '0.4rem', color: '#4b5563', lineHeight: '1.7', fontSize: '0.85rem', textAlign: 'right' }}>
                              <span style={{ color: '#9ca3af', fontWeight: '600', marginLeft: '0.35rem' }}>القطع:</span>
                              {val.parts.join('، ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {totalBox('إجمالى المصنعيات', totalLabor, '#5b21b6', '#faf5ff')}
                  </div>
                )
              })()}

              {/* ── 4. GRAND TOTAL ── */}
              <div style={{ marginBottom: '2rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#1e3a8a', padding: '0.75rem 1rem', textAlign: 'center' }}>
                  <span style={{ color: 'white', fontWeight: '700', fontSize: '0.95rem' }}>ملخص التكاليف</span>
                </div>
                {pd.part_prices.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>
                    <span style={{ fontWeight: '600', color: '#1e3a8a' }}>{(pd.total_parts || 0).toLocaleString()} ج.م</span>
                    <span style={{ color: '#374151' }}>قطع الغيار</span>
                  </div>
                )}
                {(pd.repair_groups.length > 0 || pd.replace_groups.length > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb' }}>
                    <span style={{ fontWeight: '600', color: '#7c3aed' }}>{((pd.total_repair || 0) + (pd.total_replace_labor || 0)).toLocaleString()} ج.م</span>
                    <span style={{ color: '#374151' }}>المصنعيات</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', backgroundColor: '#dcfce7' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#16a34a' }}>{(pd.grand_total || 0).toLocaleString()} ج.م</span>
                  <span style={{ fontSize: '1rem', fontWeight: '700', color: '#166534' }}>إجمالى التكلفة</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af', border: '1px dashed #e5e7eb', borderRadius: '0.5rem', marginBottom: '2rem' }}>
              لا تتوفر بيانات تسعير لهذا التقدير
            </div>
          )}

          {/* ── WATERMARK ── */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', letterSpacing: '0.05em' }}>
              Powered by <span style={{ fontWeight: 'bold', color: '#2563eb' }}>G-Fast</span>
            </p>
          </div>

          {/* ── SHARE ── */}
          <div style={{ backgroundColor: '#f3f4f6', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#0f172a', marginTop: 0, marginBottom: '1rem' }}>شارك التقرير</h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input type="text" value={shareUrl} readOnly
                style={{ flex: '1 1 180px', minWidth: 0, padding: '0.75rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.85rem', color: '#6b7280', textAlign: 'right' }}
              />
              <button onClick={copyToClipboard}
                style={{ flex: '1 1 140px', padding: '0.75rem 1rem', backgroundColor: copied ? '#16a34a' : '#2563eb', color: 'white', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                {copied ? '✅ تم النسخ' : '📋 نسخ الرابط'}
              </button>
            </div>
          </div>

          {/* ── BACK ── */}
          <button onClick={() => navigate('/dashboard')}
            style={{ width: '100%', padding: '1rem', backgroundColor: '#f3f4f6', color: '#2563eb', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontWeight: 'bold', cursor: 'pointer' }}>
            ← العودة للتقديرات
          </button>
        </div>
      </div>
    </div>
  )
}

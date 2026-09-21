import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import AssessmentReportView from '@/components/AssessmentReportView'

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

  // Shared, read-only report document (identical to the broker portal's view).
  // Workshop-only controls (Share/Back) are injected via the footer slot.
  return (
    <AssessmentReportView
      report={report}
      chain={chain}
      currentEstimateId={estimateId || ''}
      chainHrefBase="/report"
      footer={
        <>
          {/* ── SHARE ── */}
          <div className="gf-no-print" style={{ backgroundColor: '#f3f4f6', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
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
          <button onClick={() => navigate('/dashboard')} className="gf-no-print"
            style={{ width: '100%', padding: '1rem', backgroundColor: '#f3f4f6', color: '#2563eb', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontWeight: 'bold', cursor: 'pointer' }}>
            ← العودة للتقديرات
          </button>
        </>
      }
    />
  )
}

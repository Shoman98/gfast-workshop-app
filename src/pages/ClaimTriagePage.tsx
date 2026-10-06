import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

function getSession() {
  try { return JSON.parse(localStorage.getItem('customer_session') || '{}') } catch { return {} }
}
function authHeader() {
  return { Authorization: `Bearer ${getSession().token || ''}`, 'Content-Type': 'application/json' }
}

const VERDICTS_AR = { valid: 'مقبول ✅', not_valid: 'مرفوض ❌', needs_more_info: 'يحتاج معلومات إضافية ⚠️' }
const VERDICT_COLORS = { valid: '#15803d', not_valid: '#b91c1c', needs_more_info: '#f59e0b' }
const VERDICT_BG = { valid: '#f0fdf4', not_valid: '#fef2f2', needs_more_info: '#fffbeb' }

export default function ClaimTriagePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [claim, setClaim] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [recheckLoading, setRecheckLoading] = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement>>({})

  useEffect(() => {
    fetch(apiUrl(`/api/claims/${id}`), { headers: authHeader() })
      .then(r => r.json())
      .then(d => { setClaim(d.claim); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  const uploadDoc = async (reasonCode: string, file: File) => {
    setUploading(prev => ({ ...prev, [reasonCode]: true }))
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('reason_code', reasonCode)
      const res = await fetch(apiUrl(`/api/claims/${id}/documents`), {
        method: 'POST', headers: authHeader(), body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل رفع الملف')
      // Re-fetch claim to show updated documents
      const r = await fetch(apiUrl(`/api/claims/${id}`), { headers: authHeader() })
      const d = await r.json()
      setClaim(d.claim)
    } catch (e: any) {
      alert('خطأ: ' + e.message)
    } finally {
      setUploading(prev => ({ ...prev, [reasonCode]: false }))
    }
  }

  const recheck = async () => {
    setRecheckLoading(true)
    try {
      const res = await fetch(apiUrl(`/api/claims/${id}/recheck`), {
        method: 'POST', headers: authHeader(),
      })
      if (!res.ok) throw new Error('فشل إعادة الفحص')
      const r = await fetch(apiUrl(`/api/claims/${id}`), { headers: authHeader() })
      const d = await r.json()
      setClaim(d.claim)
    } catch (e: any) {
      alert('خطأ: ' + e.message)
    } finally {
      setRecheckLoading(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl', background: '#f8fafc' }}>
      <span style={{ color: '#94a3b8' }}>جاري التحميل…</span>
    </div>
  )

  if (!claim) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
      <span style={{ color: '#b91c1c' }}>المطالبة غير موجودة</span>
    </div>
  )

  const triage = claim.claim_triage?.[0]
  const reasons = triage?.ineligibility_reasons || []
  const verdict = triage?.verdict || 'unknown'
  const docs = claim.claim_documents || []

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: '#1e3a8a', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: 1 }}>G-FAST</span>
        <button onClick={() => navigate('/customer/dashboard')} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: '.82rem' }}>← لوحة التحكم</button>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(16px,4vw,28px) clamp(12px,4vw,20px)' }}>
        {/* Verdict banner */}
        <div style={{
          padding: '20px', background: VERDICT_BG[verdict as keyof typeof VERDICT_BG] || '#fff',
          border: `2px solid ${VERDICT_COLORS[verdict as keyof typeof VERDICT_COLORS] || '#cbd5e1'}`,
          borderRadius: 14, marginBottom: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>
            {verdict === 'valid' ? '✅' : verdict === 'not_valid' ? '❌' : '⚠️'}
          </div>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: VERDICT_COLORS[verdict as keyof typeof VERDICT_COLORS] || '#374151', marginBottom: 4 }}>
            {VERDICTS_AR[verdict as keyof typeof VERDICTS_AR] || verdict}
          </div>
          {triage?.verdict_summary && (
            <div style={{ fontSize: '.88rem', color: '#64748b', marginTop: 8 }}>
              {triage.verdict_summary}
            </div>
          )}
        </div>

        {/* Checks summary */}
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', padding: '18px', marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', marginBottom: 12 }}>📋 نتائج الفحص</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '.85rem' }}>
            {[
              ['الوثيقة سارية', triage?.check_policy_valid],
              ['السيارة مطابقة', triage?.check_vehicle_match],
              ['نوع الحادث مغطى', triage?.check_claim_type_covered],
              ['التاريخ صحيح', triage?.check_accident_date],
              ['الموقع مسموح', triage?.check_geography],
              ['السائق موثق', triage?.check_driver_verified],
            ].map(([label, value]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b' }}>{label}</span>
                <span style={{ fontWeight: 700, color: value ? '#15803d' : value === false ? '#b91c1c' : '#94a3b8' }}>
                  {value === true ? '✓' : value === false ? '✗' : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Ineligibility reasons & document upload */}
        {reasons.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', padding: '18px', marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', marginBottom: 12 }}>🔴 أسباب عدم القبول</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reasons.map((r, i) => {
                const hasDoc = docs.find(d => d.reason_code === r.reason_code)
                return (
                  <div key={i} style={{ padding: '12px', background: '#fef2f2', borderRadius: 10, borderLeft: '3px solid #dc2626' }}>
                    <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 4 }}>{r.reason_ar}</div>
                    <div style={{ fontSize: '.82rem', color: '#64748b', marginBottom: 10 }}>{r.required_doc_ar}</div>
                    <input ref={ref => fileRefs.current![r.reason_code] = ref!} type="file" style={{ display: 'none' }}
                      onChange={e => e.target.files?.[0] && uploadDoc(r.reason_code, e.target.files[0])} />
                    <button onClick={() => fileRefs.current[r.reason_code]?.click()}
                      disabled={uploading[r.reason_code]}
                      style={{
                        padding: '6px 14px', background: hasDoc ? '#eff6ff' : '#fef2f2', color: hasDoc ? '#1d4ed8' : '#b91c1c',
                        border: `1px solid ${hasDoc ? '#bfdbfe' : '#fecaca'}`, borderRadius: 8, fontWeight: 700, fontSize: '.78rem',
                        cursor: 'pointer',
                      }}>
                      {uploading[r.reason_code] ? '⏳ جاري…' : hasDoc ? '✓ تم الرفع' : '📤 اضغط لرفع ملف'}
                    </button>
                  </div>
                )
              })}
            </div>
            {docs.length > 0 && (
              <button onClick={recheck} disabled={recheckLoading}
                style={{ marginTop: 16, padding: '10px 20px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                {recheckLoading ? '⏳ جاري إعادة الفحص…' : '🔄 إعادة فحص المطالبة'}
              </button>
            )}
          </div>
        )}

        {/* Fraud risk */}
        {triage?.fraud_risk_level && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '14px', marginBottom: 16, borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '.85rem', color: '#64748b' }}>مستوى المخاطر:</div>
            <div style={{ fontWeight: 700, color: triage.fraud_risk_level === 'high' ? '#b91c1c' : triage.fraud_risk_level === 'medium' ? '#f59e0b' : '#15803d' }}>
              {triage.fraud_risk_level === 'high' ? '⚠️ عالي' : triage.fraud_risk_level === 'medium' ? '⚡ متوسط' : '✓ منخفض'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

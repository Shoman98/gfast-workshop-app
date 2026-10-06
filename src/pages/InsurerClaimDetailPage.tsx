import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('broker_session') && JSON.parse(localStorage.getItem('broker_session') || '{}').token || ''}`, 'Content-Type': 'application/json' }
}

const Section = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', marginBottom: 16, overflow: 'hidden' }}>
    <div style={{ padding: '13px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon} {title}
    </div>
    <div style={{ padding: '4px 18px 10px' }}>{children}</div>
  </div>
)

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  value !== null && value !== undefined && value !== '' ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
      <span style={{ color: '#64748b', fontSize: '.88rem', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: '.88rem', color: '#0f172a', textAlign: 'left' }}>{value}</span>
    </div>
  ) : null
)

export default function InsurerClaimDetailPage() {
  const { claimId } = useParams()
  const navigate = useNavigate()
  const [claim, setClaim] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(apiUrl(`/api/claims/detail/${claimId}`), { headers: authHeader() })
      .then(r => r.json())
      .then(d => { setClaim(d.claim); setLoading(false) })
      .catch(() => setLoading(false))
  }, [claimId])

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

  const fnol = claim.raw_fnol_data || {}
  const policy = claim.raw_policy_data || {}
  const driver = claim.raw_driver_data || {}
  const pd = claim.policy_data?.[0] || {}
  const driverObj = claim.driver
  const triage = claim.claim_triage?.[0]

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: '#1e3a8a', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: 1 }}>G-FAST</span>
        <button onClick={() => navigate(-1 as any)} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: '.82rem' }}>← رجوع</button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(16px,4vw,28px) clamp(12px,4vw,20px)' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontWeight: 800, fontSize: '1.3rem', color: '#0f172a', marginBottom: 8 }}>
            {claim.claim_type === 'accident' ? '🚗 حادث' : claim.claim_type === 'theft' ? '🚨 سرقة' : claim.claim_type === 'fire' ? '🔥 حريق' : '💧 فيضان'}
          </h1>
          <p style={{ color: '#64748b', fontSize: '.9rem', margin: 0 }}>
            {fnol.fnol_id && `FNOL ID: ${fnol.fnol_id}`} • {policy.policy_number && `Policy: ${policy.policy_number}`}
          </p>
        </div>

        {/* FNOL Data */}
        <Section title="تقرير الأضرار (FNOL)" icon="📷">
          <Row label="FNOL ID" value={fnol.fnol_id} />
          <Row label="تاريخ التقديم" value={fnol.submitted_at && new Date(fnol.submitted_at).toLocaleDateString('ar-EG')} />
          <Row label="وصف الحادثة" value={fnol.description} />
          <Row label="الموقع" value={fnol.location} />
          <Row label="عدد الصور" value={fnol.image_count} />
        </Section>

        {/* Policy Data */}
        <Section title="بيانات الوثيقة" icon="📋">
          <Row label="رقم الوثيقة" value={policy.policy_number} />
          <Row label="نوع التأمين" value={policy.policy_type} />
          <Row label="شركة التأمين" value={policy.insurer_company} />
          <Row label="تاريخ الإصدار" value={policy.issue_date && new Date(policy.issue_date).toLocaleDateString('ar-EG')} />
          <Row label="تاريخ الانتهاء" value={policy.expiry_date && new Date(policy.expiry_date).toLocaleDateString('ar-EG')} />
          <Row label="المبلغ المؤمن" value={policy.sum_insured && `${Number(policy.sum_insured).toLocaleString()} ج.م`} />
          <Row label="التحمل" value={policy.deductible && `${Number(policy.deductible).toLocaleString()} ج.م`} />
        </Section>

        {/* Vehicle Data */}
        <Section title="بيانات السيارة" icon="🚗">
          <Row label="الماركة" value={`${policy.vehicle_year} ${policy.vehicle_make} ${policy.vehicle_model}`} />
          <Row label="اللون" value={policy.vehicle_color} />
          <Row label="رقم الشاسيه" value={policy.vehicle_vin} />
          <Row label="رقم اللوحة" value={policy.vehicle_license} />
          <Row label="تقييم السيارة" value={policy.car_valuation && `${Number(policy.car_valuation).toLocaleString()} ج.م`} />
        </Section>

        {/* Driver Data */}
        <Section title="بيانات السائق" icon="👤">
          <Row label="الاسم" value={driver.name || driverObj?.name} />
          <Row label="رقم الرخصة" value={driver.license || driverObj?.license_number} />
          <Row label="تاريخ الميلاد" value={driver.dob && new Date(driver.dob).toLocaleDateString('ar-EG')} />
          <Row label="الهاتف" value={driver.phone || driverObj?.phone} />
          <Row label="العنوان" value={driver.address || driverObj?.address} />
        </Section>

        {/* Insured Data */}
        <Section title="بيانات المؤمن له" icon="🪪">
          <Row label="الاسم" value={policy.insured_name} />
          <Row label="رقم الهوية" value={policy.insured_id} />
          <Row label="العنوان" value={policy.insured_address} />
        </Section>

        {/* Fraud Signals */}
        {(pd.fraud_num_claims_per_year || pd.fraud_risk_level) && (
          <Section title="مؤشرات الاحتيال" icon="⚠️">
            <Row label="عدد المطالبات/السنة" value={pd.fraud_num_claims_per_year} />
            <Row label="مستوى المخاطر" value={
              pd.fraud_risk_level === 'high' ? '🔴 عالي' :
              pd.fraud_risk_level === 'medium' ? '🟡 متوسط' : '🟢 منخفض'
            } />
            <Row label="حادث بعد الإصدار" value={pd.fraud_accident_after_issue ? '✓ نعم' : pd.fraud_accident_after_issue === false ? '✗ لا' : '—'} />
            <Row label="سائق غير موثق" value={pd.fraud_unverified_driver ? '✓ نعم' : pd.fraud_unverified_driver === false ? '✗ لا' : '—'} />
            <Row label="عدم تطابق VIN" value={pd.fraud_vin_mismatch ? '✓ نعم' : pd.fraud_vin_mismatch === false ? '✗ لا' : '—'} />
          </Section>
        )}

        {/* Police Report */}
        {pd.police_report_exists !== null && (
          <Section title="تقرير الشرطة" icon="🚔">
            <Row label="يوجد تقرير شرطة" value={pd.police_report_exists ? '✓ نعم' : '✗ لا'} />
            <Row label="تاريخ الحادث" value={pd.accident_date && new Date(pd.accident_date).toLocaleDateString('ar-EG')} />
            <Row label="موقع الحادث" value={pd.accident_location} />
            <Row label="السيارة تطابق الوثيقة" value={pd.police_vehicle_matches ? '✓' : pd.police_vehicle_matches === false ? '✗' : '—'} />
            <Row label="السائق يطابق" value={pd.police_driver_matches ? '✓' : pd.police_driver_matches === false ? '✗' : '—'} />
            <Row label="التاريخ يطابق" value={pd.police_date_matches ? '✓' : pd.police_date_matches === false ? '✗' : '—'} />
          </Section>
        )}

        {/* Coverage Eligibility */}
        <Section title="أهلية التغطية" icon="✅">
          <Row label="التغطية: حوادث" value={pd.coverage_collision ? '✓ مغطاة' : '✗ غير مغطاة'} />
          <Row label="التغطية: سرقة" value={pd.coverage_theft ? '✓ مغطاة' : '✗ غير مغطاة'} />
          <Row label="التغطية: حريق" value={pd.coverage_fire ? '✓ مغطاة' : '✗ غير مغطاة'} />
          <Row label="الاستثناءات" value={pd.exclusions} />
        </Section>

        {/* Triage Status */}
        {triage && (
          <Section title="نتيجة التقييم" icon="📊">
            <Row label="الحكم" value={
              triage.verdict === 'valid' ? '✅ مقبول' :
              triage.verdict === 'not_valid' ? '❌ مرفوض' : '⚠️ يحتاج معلومات'
            } />
            <Row label="الملخص" value={triage.verdict_summary} />
          </Section>
        )}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

function getSession() {
  try { return JSON.parse(localStorage.getItem('customer_session') || '{}') } catch { return {} }
}
function authHeader() {
  return { Authorization: `Bearer ${getSession().token || ''}`, 'Content-Type': 'application/json' }
}

// Editable field — shows value or an input when in edit mode and value is null/empty
function EditableRow({ label, fieldKey, value, edits, setEdits, editMode, type = 'text' }: {
  label: string; fieldKey: string; value: any; edits: Record<string, any>
  setEdits: (e: Record<string, any>) => void; editMode: boolean; type?: string
}) {
  const current = fieldKey in edits ? edits[fieldKey] : value
  const isEmpty = current === null || current === undefined || current === ''
  if (!editMode && isEmpty) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
      <span style={{ color: '#64748b', fontSize: '.88rem', flexShrink: 0 }}>{label}</span>
      {editMode ? (
        <input value={current ?? ''} type={type}
          onChange={e => setEdits({ ...edits, [fieldKey]: e.target.value || null })}
          style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 8px', fontSize: '.85rem', color: '#0f172a', background: isEmpty ? '#fffbeb' : '#fff', width: '55%', textAlign: 'left', direction: 'ltr' }}
          placeholder={isEmpty ? 'أدخل القيمة…' : ''} />
      ) : (
        <span style={{ fontWeight: 600, fontSize: '.88rem', color: '#0f172a', textAlign: 'left', direction: 'ltr' }}>{current}</span>
      )}
    </div>
  )
}

const Bool = ({ v }: { v: boolean | null }) =>
  v === true ? <span style={{ color: '#15803d', fontWeight: 700 }}>✓ نعم</span>
  : v === false ? <span style={{ color: '#b91c1c', fontWeight: 700 }}>✗ لا</span>
  : <span style={{ color: '#94a3b8' }}>—</span>

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  value !== null && value !== undefined && value !== '' ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
      <span style={{ color: '#64748b', fontSize: '.88rem', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: '.88rem', color: '#0f172a', textAlign: 'left', direction: 'ltr' }}>{value}</span>
    </div>
  ) : null
)

const Section = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', marginBottom: 16, overflow: 'hidden' }}>
    <div style={{ padding: '13px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon} {title}
    </div>
    <div style={{ padding: '4px 18px 10px' }}>{children}</div>
  </div>
)

export default function PolicyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [policy, setPolicy] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [edits, setEdits] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const res = await fetch(apiUrl(`/api/customer/policies/${id}`), { headers: authHeader() })
    const data = await res.json()
    if (res.ok) setPolicy(data.policy)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  // Poll while extracting
  useEffect(() => {
    if (policy?.status === 'extracting' || policy?.status === 'pending') {
      setPolling(true)
      const t = setInterval(async () => {
        const res = await fetch(apiUrl(`/api/customer/policies/${id}/status`), { headers: authHeader() })
        const data = await res.json()
        if (data.policy?.status === 'extracted' || data.policy?.status === 'failed') {
          clearInterval(t); setPolling(false); load()
        }
      }, 3000)
      return () => clearInterval(t)
    } else { setPolling(false) }
  }, [policy?.status])

  const saveEdits = async () => {
    if (!Object.keys(edits).length) { setEditMode(false); return }
    setSaving(true)
    try {
      await fetch(apiUrl(`/api/customer/policies/${id}/data`), {
        method: 'PATCH', headers: authHeader(), body: JSON.stringify(edits)
      })
      await load(); setEdits({}); setEditMode(false)
    } finally { setSaving(false) }
  }

  const pd = policy?.policy_data

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl', background: '#f8fafc' }}>
      <span style={{ color: '#94a3b8' }}>جاري التحميل…</span>
    </div>
  )

  if (!policy) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
      <span style={{ color: '#b91c1c' }}>الوثيقة غير موجودة</span>
    </div>
  )

  const page: React.CSSProperties = {
    minHeight: '100dvh', background: '#f8fafc', direction: 'rtl',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }

  return (
    <div style={page}>
      <div style={{ background: '#1e3a8a', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: 1 }}>G-FAST</span>
        <button onClick={() => navigate('/customer/dashboard')} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: '.82rem' }}>← وثائقي</button>
      </div>

      <style>{`
        @media (max-width: 600px) {
          .pd-edit-row input { width: 100% !important; margin-top: 4px; }
          .pd-edit-row { flex-direction: column !important; align-items: flex-start !important; }
          .pd-section { border-radius: 10px !important; }
        }
      `}</style>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(16px,4vw,28px) clamp(12px,4vw,20px)' }}>
        {/* Status banner */}
        {(policy.status === 'extracting' || policy.status === 'pending') && (
          <div style={{ padding: '16px 20px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 12, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.4rem' }}>⏳</span>
            <div>
              <div style={{ fontWeight: 700, color: '#1d4ed8' }}>جاري استخراج البيانات من الوثيقة…</div>
              <div style={{ fontSize: '.82rem', color: '#3b82f6', marginTop: 2 }}>الصفحة تتحدث تلقائياً</div>
            </div>
          </div>
        )}
        {policy.status === 'failed' && (
          <div style={{ padding: '16px 20px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: '#b91c1c' }}>❌ فشل استخراج البيانات</div>
            {policy.error_message && <div style={{ fontSize: '.82rem', color: '#dc2626', marginTop: 4 }}>{policy.error_message}</div>}
          </div>
        )}

        {/* Header card */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#0f172a' }}>
            {policy.insurer || 'وثيقة تأمين'}
          </div>
          {policy.policy_number && <div style={{ color: '#64748b', fontSize: '.88rem', marginTop: 4 }}>رقم الوثيقة: {policy.policy_number}</div>}
          {pd && (
            <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['حوادث', pd.coverage_collision], ['سرقة', pd.coverage_theft], ['حريق', pd.coverage_fire], ['زجاج', pd.coverage_glass], ['فيضان', pd.coverage_flood], ['ضد الغير', pd.coverage_tpl]]
                .filter(([, v]) => v).map(([label]) => (
                  <span key={label as string} style={{ padding: '3px 12px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 999, fontSize: '.78rem', fontWeight: 700 }}>{label as string}</span>
                ))}
            </div>
          )}
        </div>

        {/* Edit toolbar */}
        {pd && policy.status === 'extracted' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {!editMode ? (
              <button onClick={() => setEditMode(true)}
                style={{ padding: '9px 20px', background: '#eff6ff', color: '#1e3a8a', border: '1.5px solid #bfdbfe', borderRadius: 8, fontWeight: 700, fontSize: '.88rem', cursor: 'pointer' }}>
                ✏️ تعديل البيانات الناقصة
              </button>
            ) : (
              <>
                <button onClick={saveEdits} disabled={saving}
                  style={{ padding: '9px 20px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '.88rem', cursor: 'pointer' }}>
                  {saving ? 'جاري الحفظ…' : '✓ حفظ'}
                </button>
                <button onClick={() => { setEdits({}); setEditMode(false) }}
                  style={{ padding: '9px 20px', background: '#f1f5f9', color: '#374151', border: '1.5px solid #e2e8f0', borderRadius: 8, fontWeight: 700, fontSize: '.88rem', cursor: 'pointer' }}>
                  إلغاء
                </button>
              </>
            )}
          </div>
        )}

        {pd && (
          <>
            {/* Policy Info */}
            <Section title="بيانات الوثيقة" icon="📋">
              <EditableRow label="نوع التأمين" fieldKey="policy_type" value={pd.policy_type} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="شركة التأمين" fieldKey="insurer_company" value={pd.insurer_company} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="الفرع" fieldKey="branch" value={pd.branch} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="تاريخ الإصدار" fieldKey="issue_date" value={pd.issue_date} edits={edits} setEdits={setEdits} editMode={editMode} type="date" />
              <EditableRow label="بداية التأمين" fieldKey="start_date" value={pd.start_date} edits={edits} setEdits={setEdits} editMode={editMode} type="date" />
              <EditableRow label="انتهاء التأمين" fieldKey="expiry_date" value={pd.expiry_date} edits={edits} setEdits={setEdits} editMode={editMode} type="date" />
              <EditableRow label="تاريخ التجديد" fieldKey="renewal_date" value={pd.renewal_date} edits={edits} setEdits={setEdits} editMode={editMode} type="date" />
              <EditableRow label="تاريخ القسط" fieldKey="installment_date" value={pd.installment_date} edits={edits} setEdits={setEdits} editMode={editMode} type="date" />
              <EditableRow label="النطاق الجغرافي" fieldKey="geography" value={pd.geography} edits={edits} setEdits={setEdits} editMode={editMode} />
            </Section>

            {/* Vehicle */}
            <Section title="السيارة" icon="🚗">
              <EditableRow label="الماركة" fieldKey="vehicle_make" value={pd.vehicle_make} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="الموديل" fieldKey="vehicle_model" value={pd.vehicle_model} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="سنة الصنع" fieldKey="vehicle_year" value={pd.vehicle_year} edits={edits} setEdits={setEdits} editMode={editMode} type="number" />
              <EditableRow label="اللون" fieldKey="vehicle_color" value={pd.vehicle_color} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="رقم الشاسيه (VIN)" fieldKey="vehicle_vin" value={pd.vehicle_vin} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="رقم اللوحة" fieldKey="vehicle_license" value={pd.vehicle_license} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="تقييم السيارة (ج.م)" fieldKey="car_valuation" value={pd.car_valuation} edits={edits} setEdits={setEdits} editMode={editMode} type="number" />
            </Section>

            {/* Insured/Driver */}
            <Section title="المؤمن له / السائق" icon="👤">
              <EditableRow label="اسم المؤمن له" fieldKey="insured_name" value={pd.insured_name} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="رقم الهوية" fieldKey="insured_id" value={pd.insured_id} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="العنوان" fieldKey="insured_address" value={pd.insured_address} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="اسم السائق" fieldKey="driver_name" value={pd.driver_name} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="رخصة القيادة" fieldKey="driver_license" value={pd.driver_license} edits={edits} setEdits={setEdits} editMode={editMode} />
              <EditableRow label="تاريخ ميلاد السائق" fieldKey="driver_dob" value={pd.driver_dob} edits={edits} setEdits={setEdits} editMode={editMode} type="date" />
              <EditableRow label="عدد الأشخاص" fieldKey="num_passengers" value={pd.num_passengers} edits={edits} setEdits={setEdits} editMode={editMode} type="number" />
            </Section>

            {/* Financial */}
            <Section title="التغطية المالية" icon="💰">
              <EditableRow label="مبلغ التأمين (ج.م)" fieldKey="sum_insured" value={pd.sum_insured} edits={edits} setEdits={setEdits} editMode={editMode} type="number" />
              <EditableRow label="القسط (ج.م)" fieldKey="premium" value={pd.premium} edits={edits} setEdits={setEdits} editMode={editMode} type="number" />
              <EditableRow label="التحمل (ج.م)" fieldKey="deductible" value={pd.deductible} edits={edits} setEdits={setEdits} editMode={editMode} type="number" />
              {pd.limits && Object.entries(pd.limits).filter(([, v]) => v).map(([k, v]) => (
                <Row key={k} label={k} value={`${Number(v).toLocaleString()} ج.م`} />
              ))}
            </Section>

            {/* Terms */}
            {(pd.exclusions || pd.special_conditions || pd.endorsements) && (
              <Section title="الشروط والاستثناءات" icon="📝">
                {pd.exclusions && <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ color: '#64748b', fontSize: '.82rem', marginBottom: 4 }}>الاستثناءات</div>
                  <div style={{ fontSize: '.88rem', color: '#0f172a', lineHeight: 1.6 }}>{pd.exclusions}</div>
                </div>}
                {pd.special_conditions && <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ color: '#64748b', fontSize: '.82rem', marginBottom: 4 }}>الشروط الخاصة</div>
                  <div style={{ fontSize: '.88rem', color: '#0f172a', lineHeight: 1.6 }}>{pd.special_conditions}</div>
                </div>}
                {pd.endorsements && <div style={{ padding: '8px 0' }}>
                  <div style={{ color: '#64748b', fontSize: '.82rem', marginBottom: 4 }}>الملاحق</div>
                  <div style={{ fontSize: '.88rem', color: '#0f172a', lineHeight: 1.6 }}>{pd.endorsements}</div>
                </div>}
              </Section>
            )}

            {/* Previous Damage */}
            <Section title="حالة السيارة السابقة" icon="🔍">
              <Row label="أضرار هيكلية سابقة" value={<Bool v={pd.prev_structural_damage} />} />
              <Row label="إصلاحات حوادث سابقة" value={<Bool v={pd.prev_accident_repairs} />} />
              <Row label="صدأ / تآكل" value={<Bool v={pd.corrosion} />} />
              <Row label="شاسيه متضرر" value={<Bool v={pd.compromised_chassis} />} />
              <Row label="وسائد هوائية سبق انفجارها" value={<Bool v={pd.prior_airbag_deployment} />} />
              <Row label="إصلاحات رديئة سابقة" value={<Bool v={pd.poor_previous_repairs} />} />
            </Section>

            {/* Fraud Signals */}
            <Section title="مؤشرات الاحتيال" icon="⚠️">
              <Row label="عدد المطالبات / السنة" value={pd.fraud_num_claims_per_year} />
              <Row label="حادث بعد إصدار الوثيقة مباشرة" value={<Bool v={pd.fraud_accident_after_issue} />} />
              <Row label="حادث بعد تعديل الوثيقة" value={<Bool v={pd.fraud_accident_after_changes} />} />
              <Row label="سائق غير موثق" value={<Bool v={pd.fraud_unverified_driver} />} />
              <Row label="مطالبة مكررة" value={<Bool v={pd.fraud_duplicate_claim} />} />
              <Row label="نمط حوادث مشبوه" value={<Bool v={pd.fraud_accident_history_pattern} />} />
              <Row label="فجوة بين تاريخ الحادث وتقديم المطالبة" value={<Bool v={pd.fraud_date_variant} />} />
              <Row label="عدم تطابق VIN" value={<Bool v={pd.fraud_vin_mismatch} />} />
              <Row label="عدم تطابق مالك الوثيقة" value={<Bool v={pd.fraud_policyholder_mismatch} />} />
            </Section>

            {/* Police Report */}
            {(pd.police_report_exists !== null || pd.accident_date) && (
              <Section title="تقرير الشرطة / الحادث" icon="🚔">
                {pd.accident_date && <Row label="تاريخ الحادث" value={new Date(pd.accident_date).toLocaleDateString('ar-EG')} />}
                <Row label="مكان الحادث" value={pd.accident_location} />
                <Row label="السيارات المتورطة" value={pd.accident_vehicles_involved} />
                <Row label="السائقون" value={pd.accident_drivers} />
                <Row label="الأضرار المبلغ عنها" value={pd.reported_damage} />
                <Row label="الإصابات المبلغ عنها" value={pd.reported_injuries} />
                <Row label="يوجد تقرير شرطة" value={<Bool v={pd.police_report_exists} />} />
                <Row label="السيارة تطابق الوثيقة ✅" value={<Bool v={pd.police_vehicle_matches} />} />
                <Row label="السائق يطابق FNOL ✅" value={<Bool v={pd.police_driver_matches} />} />
                <Row label="التاريخ يطابق ✅" value={<Bool v={pd.police_date_matches} />} />
                <Row label="الموقع يطابق ✅" value={<Bool v={pd.police_location_matches} />} />
                <Row label="الوصف متسق ✅" value={<Bool v={pd.police_description_consistent} />} />
                <Row label="السيارة الأخرى تطابق ✅" value={<Bool v={pd.police_other_vehicle_matches} />} />
                <Row label="الأضرار متسقة ⚠️" value={<Bool v={pd.police_damage_consistent} />} />
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

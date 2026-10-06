import { useLocation, useNavigate } from 'react-router-dom'

export default function ClaimAnalysisResultsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { analysis, description } = location.state || {}

  if (!analysis) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>❌</div>
          <div style={{ fontWeight: 700, color: '#b91c1c' }}>لا توجد نتائج تحليل</div>
        </div>
      </div>
    )
  }

  const damages = analysis.damages || []
  const needsCheck = analysis.needs_check_parts || []

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: '#1e3a8a', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: 1 }}>G-FAST</span>
        <button onClick={() => navigate('/customer/dashboard')} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: '.82rem' }}>← لوحة التحكم</button>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(16px,4vw,28px) clamp(12px,4vw,20px)' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontWeight: 800, fontSize: '1.3rem', color: '#0f172a', marginBottom: 8 }}>نتائج تحليل الأضرار</h1>
          <p style={{ color: '#64748b', fontSize: '.9rem', margin: 0 }}>
            تم تحليل صور السيارة بنجاح
          </p>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
          <div style={{ background: '#fff', padding: '16px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e3a8a' }}>{damages.length}</div>
            <div style={{ fontSize: '.85rem', color: '#64748b', marginTop: 4 }}>🔧 قطع قابلة للإصلاح</div>
          </div>
          <div style={{ background: '#fff', padding: '16px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.07)' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>{needsCheck.length}</div>
            <div style={{ fontSize: '.85rem', color: '#64748b', marginTop: 4 }}>🔍 قطع تحتاج فحص</div>
          </div>
        </div>

        {/* Damages section */}
        {damages.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', padding: '20px', marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              🔧 <span>قطع قابلة للإصلاح</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {damages.map((d, i) => (
                <div key={i} style={{ padding: '12px', background: '#eff6ff', borderRadius: 10, borderLeft: '3px solid #1d4ed8' }}>
                  <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '.95rem' }}>
                    {d.part_name_ar || d.name_ar || 'قطعة'}
                  </div>
                  {d.damage_type && (
                    <div style={{ fontSize: '.82rem', color: '#64748b', marginTop: 4 }}>
                      الضرر: {d.damage_type}
                    </div>
                  )}
                  {d.severity_label && (
                    <div style={{ fontSize: '.82rem', color: '#64748b', marginTop: 2 }}>
                      الشدة: {d.severity_label}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Needs check section */}
        {needsCheck.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', padding: '20px', marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              🔍 <span>قطع تحتاج فحص</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {needsCheck.map((p, i) => (
                <div key={i} style={{ padding: '12px', background: '#fffbeb', borderRadius: 10, borderLeft: '3px solid #f59e0b' }}>
                  <div style={{ fontWeight: 700, color: '#d97706', fontSize: '.95rem' }}>
                    {p.part_name_ar || p.name_ar || 'قطعة'}
                  </div>
                  {p.damage_type && (
                    <div style={{ fontSize: '.82rem', color: '#64748b', marginTop: 4 }}>
                      الضرر: {p.damage_type}
                    </div>
                  )}
                  {p.confidence && (
                    <div style={{ fontSize: '.82rem', color: '#64748b', marginTop: 2 }}>
                      مستوى الثقة: {Math.round(p.confidence * 100)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description section */}
        {description && (
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', padding: '20px', marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a', marginBottom: 12 }}>📝 وصف الحادثة</div>
            <div style={{ fontSize: '.9rem', color: '#374151', lineHeight: 1.6 }}>
              {description}
            </div>
          </div>
        )}

        {/* CTA */}
        <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 14, padding: '20px', textAlign: 'center' }}>
          <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 8 }}>✅ تم تحليل الأضرار بنجاح</div>
          <div style={{ fontSize: '.88rem', color: '#3b82f6', marginBottom: 16 }}>
            يمكنك الآن العودة إلى لوحة التحكم أو تحديث وثائق أخرى
          </div>
          <button onClick={() => navigate('/customer/dashboard')}
            style={{ padding: '10px 24px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
            ← العودة إلى الوثائق
          </button>
        </div>
      </div>
    </div>
  )
}

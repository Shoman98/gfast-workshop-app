import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

/**
 * PUBLIC printable FNOL claim report — opened from the broker portal's
 * "print report" CTA. Shows part names only (no descriptions) grouped into
 * إصلاح / استبدال, plus the photos submitted in the FNOL. Printable + copyable.
 * Data: GET /api/broker/fnol-report/:id (no auth, shareable link).
 */
interface Report {
  vin?: string | null
  vehicle_license?: string | null
  vehicle_make?: string | null
  vehicle_model?: string | null
  vehicle_year?: number | null
  submitted_at?: string | null
  broker_company?: string | null
  analysis_result?: any
  general_images: string[]
  damage_images: string[]
}

const partName = (d: any) => d.part_name_ar || d.nameAr || ''

export default function FnolReport() {
  const { id = '' } = useParams()
  const [report, setReport] = useState<Report | null>(null)
  const [state, setState]   = useState<'loading' | 'notfound' | 'ready'>('loading')
  const [copied, setCopied] = useState(false)
  // Parts excluded from print/copy ONLY. Never touches stored analysis.
  const [removed, setRemoved] = useState<Set<string>>(() => {
    const ex = new URLSearchParams(window.location.search).get('exclude')
    return new Set(ex ? ex.split(',').filter(Boolean) : [])
  })
  const toggle = (key: string) => setRemoved(prev => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next
  })
  // Promoted parts: key → target section ('r' | 'p'). Seeded from URL ?promote=r0:p,n2:r
  const [promoted, setPromoted] = useState<Record<string, 'r' | 'p'>>(() => {
    const pm = new URLSearchParams(window.location.search).get('promote')
    if (!pm) return {}
    return Object.fromEntries(pm.split(',').filter(Boolean).map(s => s.split(':') as [string,'r'|'p']))
  })
  const promote = (key: string, target: 'r' | 'p') => setPromoted(prev =>
    prev[key] === target ? (({ [key]: _, ...rest }) => rest)(prev) : { ...prev, [key]: target }
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/api/broker/fnol-report/${encodeURIComponent(id)}`))
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.report) { setState('notfound'); return }
        setReport(data.report); setState('ready')
      } catch { if (!cancelled) setState('notfound') }
    })()
    return () => { cancelled = true }
  }, [id])

  const copyLink = () => {
    const url = new URL(window.location.href)
    if (removed.size) url.searchParams.set('exclude', [...removed].join(','))
    else url.searchParams.delete('exclude')
    const pm = Object.entries(promoted).map(([k,v]) => `${k}:${v}`).join(',')
    if (pm) url.searchParams.set('promote', pm)
    else url.searchParams.delete('promote')
    navigator.clipboard.writeText(url.toString())
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const page: React.CSSProperties = {
    minHeight: '100dvh', background: '#f3f4f6', padding: 'clamp(12px,3vw,24px)', direction: 'rtl',
    fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box',
  }
  const card: React.CSSProperties = {
    background: 'white', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)',
    overflow: 'hidden', marginBottom: 14, maxWidth: 780, marginInline: 'auto',
  }

  if (state === 'loading') return <div style={page}><div style={{ ...card, padding: 40, textAlign: 'center', color: '#9ca3af' }}>جاري تحميل التقرير…</div></div>
  if (state === 'notfound' || !report) return (
    <div style={page}><div style={{ ...card, padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
      <div style={{ fontWeight: 800, color: '#111827' }}>التقرير غير متاح</div>
    </div></div>
  )

  // Part names only — no descriptions. Prefer the pre-grouped broker_report.
  const a = report.analysis_result || {}
  const rep = a.broker_report
  let repairable: any[] = [], replaceable: any[] = [], needsCheck: any[] = []
  if (rep) {
    repairable  = rep.repairable  || []
    replaceable = rep.replaceable || []
    needsCheck  = rep.needsCheck  || []
  } else {
    const damages: any[] = a.damages || []
    const isReplace = (d: any) => (d.severity_label ?? d.severityDecision ?? (d.severityIndex >= 4 ? 'Replace' : 'Repair')) === 'Replace'
    repairable  = damages.filter(d => !isReplace(d))
    replaceable = damages.filter(d => isReplace(d))
    needsCheck  = a.needs_check_parts || []
  }
  // Strip any needsCheck part that already appears in repairable or replaceable
  const confirmedArNames = new Set([...repairable, ...replaceable].map((d: any) => (d.part_name_ar || d.nameAr || '').trim()).filter(Boolean))
  const seenNeedsCheck = new Set<string>()
  needsCheck = needsCheck.filter((d: any) => {
    const key = (d.part_name_ar || d.nameAr || '').trim()
    if (!key || confirmedArNames.has(key) || seenNeedsCheck.has(key)) return false
    seenNeedsCheck.add(key)
    return true
  })
  const photos = [...(report.general_images || []), ...(report.damage_images || [])]

  // Build the effective lists after applying promotions
  // promoted items from other sections are injected; promoted-away items are excluded
  const buildEffective = (items: any[], sectionKey: string, targetSection: 'r' | 'p' | 'n') => {
    // items originally in this section, minus those promoted away
    const base = items
      .filter(d => !!(d.part_name_ar || d.nameAr))
      .map((d, i) => ({ d, origKey: sectionKey + i }))
      .filter(({ origKey }) => promoted[origKey] === undefined)
    // items from other sections promoted INTO this section
    const incoming: { d: any; origKey: string }[] = []
    if (targetSection !== 'n') {
      const others: [any[], string][] = targetSection === 'r'
        ? [[replaceable, 'p'], [needsCheck, 'n']]
        : [[repairable, 'r'], [needsCheck, 'n']]
      for (const [arr, sk] of others) {
        arr.filter(d => !!(d.part_name_ar || d.nameAr)).forEach((d, i) => {
          if (promoted[sk + i] === targetSection) incoming.push({ d, origKey: sk + i })
        })
      }
    }
    return [...base, ...incoming]
  }

  const PartList = ({ items, sectionKey, title, color, indicator, subtitle, section }: {
    items: any[]; sectionKey: string; title: string; color: string; indicator: string; subtitle?: string; section: 'r' | 'p' | 'n'
  }) => {
    const effective = buildEffective(items, sectionKey, section)
    if (effective.length === 0) return null
    const includedCount = effective.filter(({ origKey }) => !removed.has(origKey)).length
    return (
      <div style={card} className={includedCount === 0 ? 'gf-removed' : undefined}>
        <div style={{ padding: '13px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '.95rem', color }}>{title} ({includedCount})</div>
        {subtitle && <div style={{ padding: '8px 18px 0', fontSize: '.82rem', color: '#6b7280', lineHeight: 1.5 }}>{subtitle}</div>}
        <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
          {effective.map(({ d, origKey }, i) => {
            const isRemoved   = removed.has(origKey)
            const isPromoted  = promoted[origKey] !== undefined
            return (
              <li key={origKey} className={isRemoved ? 'gf-removed' : undefined}
                style={{ padding: '9px 18px', borderBottom: i < effective.length - 1 ? '1px solid #f8fafc' : 'none', display: 'flex', alignItems: 'center', gap: 6, opacity: isRemoved ? 0.45 : 1 }}>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '.92rem', color: '#111827', textDecoration: isRemoved ? 'line-through' : 'none' }}>
                  <span style={{ color: isPromoted ? '#7c3aed' : color }}>{isPromoted ? '↑' : indicator}</span>
                  {partName(d)}
                  {isPromoted && <span style={{ fontSize: '.7rem', color: '#7c3aed', fontWeight: 400 }}>(مُحوَّل)</span>}
                </span>
                <div className="gf-no-print" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {/* Promote buttons — only shown when not removed */}
                  {!isRemoved && section !== 'r' && (
                    <button onClick={() => promote(origKey, 'r')}
                      style={{ padding: '3px 8px', borderRadius: 999, border: `1px solid ${promoted[origKey]==='r' ? '#7c3aed' : '#d1fae5'}`, background: promoted[origKey]==='r' ? '#ede9fe' : '#f0fdf4', color: promoted[origKey]==='r' ? '#7c3aed' : '#15803d', fontSize: '.68rem', fontWeight: 700, cursor: 'pointer' }}>
                      {promoted[origKey]==='r' ? '↩' : '→ إصلاح'}
                    </button>
                  )}
                  {!isRemoved && section !== 'p' && (
                    <button onClick={() => promote(origKey, 'p')}
                      style={{ padding: '3px 8px', borderRadius: 999, border: `1px solid ${promoted[origKey]==='p' ? '#7c3aed' : '#fee2e2'}`, background: promoted[origKey]==='p' ? '#ede9fe' : '#fef2f2', color: promoted[origKey]==='p' ? '#7c3aed' : '#b91c1c', fontSize: '.68rem', fontWeight: 700, cursor: 'pointer' }}>
                      {promoted[origKey]==='p' ? '↩' : '→ استبدال'}
                    </button>
                  )}
                  <button onClick={() => toggle(origKey)}
                    style={{ padding: '3px 8px', borderRadius: 999, border: `1px solid ${isRemoved ? '#16a34a' : '#fecaca'}`, background: isRemoved ? '#f0fdf4' : '#fef2f2', color: isRemoved ? '#15803d' : '#dc2626', fontSize: '.68rem', fontWeight: 700, cursor: 'pointer' }}>
                    {isRemoved ? '↩ إرجاع' : '× إزالة'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const vehicle = [report.vehicle_year, report.vehicle_make, report.vehicle_model].filter(Boolean).join(' ')

  return (
    <div style={page}>
      <style>{`@media print { .gf-no-print, .gf-removed { display: none !important; } body { background:#fff !important; } @page { margin: 12mm; } }`}</style>

      {/* Header */}
      <div style={{ ...card, padding: '18px 20px' }}>
        <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#111827' }}>📋 تقرير المطالبة (FNOL)</div>
        {report.broker_company && <div style={{ color: '#6b7280', fontSize: '.88rem', marginTop: 4 }}>{report.broker_company}</div>}
        <div style={{ color: '#374151', fontSize: '.9rem', marginTop: 8 }}>
          {vehicle || '—'}
          {report.vehicle_license ? <span> · 🔖 {report.vehicle_license}</span> : null}
          {report.vin ? <span style={{ fontFamily: 'monospace' }}> · {report.vin}</span> : null}
        </div>
        {report.submitted_at && <div style={{ color: '#9ca3af', fontSize: '.78rem', marginTop: 4 }}>{new Date(report.submitted_at).toLocaleDateString('ar-EG')}</div>}
      </div>

      {/* Actions */}
      <div className="gf-no-print" style={{ maxWidth: 780, margin: '0 auto 14px', display: 'flex', gap: 10 }}>
        <button onClick={() => window.print()} style={{ flex: 1, padding: '.8rem', background: '#3F3D9E', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>🖨️ طباعة التقرير</button>
        <button onClick={copyLink} style={{ flex: 1, padding: '.8rem', background: copied ? '#16a34a' : '#eef2ff', color: copied ? 'white' : '#3F3D9E', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{copied ? '✅ تم النسخ' : '📋 نسخ الرابط'}</button>
      </div>

      {/* Selection hint (screen only) */}
      {(repairable.length > 0 || replaceable.length > 0) && (
        <div className="gf-no-print" style={{ maxWidth: 780, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', color: '#6b7280', fontSize: '.78rem' }}>
          <span>اضغط «→ إصلاح» أو «→ استبدال» لتحويل قطعة · «× إزالة» لاستبعادها — لا يؤثر على التقرير الأصلي.</span>
          {(removed.size > 0 || Object.keys(promoted).length > 0) && (
            <button onClick={() => { setRemoved(new Set()); setPromoted({}) }} style={{ padding: '3px 12px', borderRadius: 999, border: '1px solid #d1d5db', background: 'white', color: '#374151', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>
              إعادة تعيين الكل
            </button>
          )}
        </div>
      )}

      {/* Part names (no descriptions) */}
      {repairable.length === 0 && replaceable.length === 0 && needsCheck.length === 0 ? (
        <div style={{ ...card, padding: 30, textAlign: 'center', color: '#9ca3af' }}>لم يتم رصد أضرار في الصور.</div>
      ) : (
        <>
          <PartList items={repairable}  sectionKey="r" section="r" title="🔧 قطع قابلة للإصلاح (موصى به)"  color="#15803d" indicator="✓" />
          <PartList items={replaceable} sectionKey="p" section="p" title="🔩 قطع تحتاج استبدال (موصى به)"  color="#b91c1c" indicator="●" />
          <PartList items={needsCheck}  sectionKey="n" section="n" title="🔍 قطع تحتاج فحص"               color="#92400e" indicator="?" subtitle="هذه القطع قد تكون سليمة ويُنصح بفحصها في المركز." />
        </>
      )}

      {/* Photos submitted in the FNOL */}
      {photos.length > 0 && (
        <div style={card}>
          <div style={{ padding: '13px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '.95rem', color: '#374151' }}>📷 صور المطالبة ({photos.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, padding: 14 }}>
            {photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                <img src={url} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }} />
              </a>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', margin: '10px 0 20px', fontSize: '.78rem', color: '#9ca3af' }}>
        Powered by <span style={{ fontWeight: 'bold', color: '#3F3D9E' }}>G-Fast</span>
      </div>
    </div>
  )
}

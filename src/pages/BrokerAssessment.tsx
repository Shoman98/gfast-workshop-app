import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiUrl } from '@/lib/api'
import AssessmentReportView, { AssessmentReport, ReportChainItem } from '@/components/AssessmentReportView'

/**
 * PUBLIC confirmed-assessment report — the broker portal's "View Report" target
 * (assessment_url = <CONSUMER_APP_URL>/assessment/:id). Renders the SAME UI and
 * data as the workshop report (Report.tsx) via the shared AssessmentReportView,
 * fed by the public endpoint GET /api/public/estimate-report/:id.
 */
export default function BrokerAssessment() {
  const { estimateId = '' } = useParams()
  const [report, setReport] = useState<AssessmentReport | null>(null)
  const [chain, setChain]   = useState<ReportChainItem[]>([])
  const [state, setState]   = useState<'loading' | 'notfound' | 'ready'>('loading')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/api/public/estimate-report/${encodeURIComponent(estimateId)}`))
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.report) { setState('notfound'); return }
        setReport(data.report); setChain(data.chain || []); setState('ready')
      } catch { if (!cancelled) setState('notfound') }
    })()
    return () => { cancelled = true }
  }, [estimateId])

  if (state === 'loading') return <Centered>جاري تحميل التقرير…</Centered>
  if (state === 'notfound' || !report) return (
    <Centered>
      <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
      <div style={{ fontWeight: 800, color: '#111827' }}>التقرير غير متاح</div>
      <div style={{ color: '#6b7280', fontSize: '.9rem', marginTop: 6 }}>لم يتم العثور على تقييم مؤكد لهذا الرقم.</div>
    </Centered>
  )

  return (
    <AssessmentReportView
      report={report}
      chain={chain}
      currentEstimateId={estimateId}
      chainHrefBase="/assessment"
    />
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', padding: 40, textAlign: 'center', maxWidth: 460, width: '100%', color: '#6b7280' }}>{children}</div>
    </div>
  )
}

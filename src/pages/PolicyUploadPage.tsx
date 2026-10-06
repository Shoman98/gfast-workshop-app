import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

function getSession() {
  try { return JSON.parse(localStorage.getItem('customer_session') || '{}') } catch { return {} }
}
function authHeader() {
  return { Authorization: `Bearer ${getSession().token || ''}` }
}

export default function PolicyUploadPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const onFile = (f: File | null) => {
    if (!f) return
    if (f.type !== 'application/pdf') { setError('يرجى رفع ملف PDF فقط'); return }
    if (f.size > 20 * 1024 * 1024) { setError('الملف أكبر من 20MB'); return }
    setFile(f); setError('')
  }

  const submit = async () => {
    if (!file) return
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(apiUrl('/api/customer/policies/upload'), {
        method: 'POST',
        headers: authHeader(),
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل رفع الوثيقة')
      navigate(`/customer/policy/${data.policy_id}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const page: React.CSSProperties = {
    minHeight: '100dvh', background: '#f8fafc', direction: 'rtl',
    fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column',
  }

  return (
    <div style={page}>
      <div style={{ background: '#1e3a8a', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: 1 }}>G-FAST</span>
        <button onClick={() => navigate('/customer/dashboard')} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontSize: '.82rem' }}>← رجوع</button>
      </div>

      <style>{`
        @media (max-width: 600px) {
          .pu-dropzone { padding: 32px 16px !important; }
        }
      `}</style>
      <div style={{ maxWidth: 580, margin: 'clamp(20px,5vw,40px) auto', padding: '0 clamp(12px,4vw,16px)', width: '100%', boxSizing: 'border-box' }}>
        <h1 style={{ fontWeight: 800, fontSize: '1.4rem', color: '#0f172a', marginBottom: 6 }}>رفع وثيقة تأمين</h1>
        <p style={{ color: '#64748b', fontSize: '.9rem', marginBottom: 28 }}>
          ارفع ملف PDF لوثيقة تأمين سيارتك وسيقوم النظام باستخراج جميع البيانات تلقائياً.
        </p>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
          style={{
            border: `2px dashed ${file ? '#1e3a8a' : '#cbd5e1'}`,
            borderRadius: 14, padding: '48px 24px', textAlign: 'center',
            background: file ? '#eff6ff' : '#fff', cursor: 'pointer', transition: 'all .2s',
          }}>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }}
            onChange={e => onFile(e.target.files?.[0] || null)} />
          {file ? (
            <>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📄</div>
              <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: '1rem' }}>{file.name}</div>
              <div style={{ color: '#64748b', fontSize: '.82rem', marginTop: 4 }}>
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </div>
              <button onClick={e => { e.stopPropagation(); setFile(null) }}
                style={{ marginTop: 12, padding: '4px 14px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: 999, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}>
                × إزالة
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📤</div>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>اضغط أو اسحب ملف PDF هنا</div>
              <div style={{ color: '#94a3b8', fontSize: '.82rem', marginTop: 4 }}>الحد الأقصى: 20MB</div>
            </>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '.88rem' }}>
            {error}
          </div>
        )}

        <button onClick={submit} disabled={!file || uploading}
          style={{
            marginTop: 20, width: '100%', padding: '14px', background: !file || uploading ? '#94a3b8' : '#1e3a8a',
            color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '1rem',
            cursor: !file || uploading ? 'not-allowed' : 'pointer', transition: 'background .2s',
          }}>
          {uploading ? '⏳ جاري الرفع والتحليل…' : '🚀 رفع وتحليل الوثيقة'}
        </button>

        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '.78rem', marginTop: 16 }}>
          يتم استخراج البيانات تلقائياً بالذكاء الاصطناعي · بياناتك محمية وسرية
        </p>
      </div>
    </div>
  )
}

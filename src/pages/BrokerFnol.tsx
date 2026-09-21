import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiUrl } from '@/lib/api'

/**
 * PUBLIC customer FNOL page — reached via the broker's shared link:
 *   /broker/fnol/:token
 *
 * Disconnected session (no app auth/layout), Arabic-only, mobile-first, and
 * embeddable (iframe) in the broker's own app later.
 *
 * On submit the general + damage photos are run through the SAME analysis
 * pipeline as wreck-vision (`/api/analysis` → @gfast/analysis-core), and the
 * grouped قطع غيار report (إصلاح / تغيير) is saved onto the FNOL so the broker
 * portal renders exactly what the pipeline produced.
 */

interface Broker { id: string; name: string; company: string }

type Screen = 'loading' | 'invalid' | 'form' | 'analyzing' | 'success'

// Guided general-photo slots — one required angle each.
const GENERAL_SLOTS = [
  { key: 'front', label: 'أمامي',      hint: 'مقدمة السيارة' },
  { key: 'back',  label: 'خلفي',       hint: 'مؤخرة السيارة' },
  { key: 'right', label: 'جانب يمين',  hint: 'الجانب الأيمن' },
  { key: 'left',  label: 'جانب يسار',  hint: 'الجانب الأيسر' },
  { key: 'roof',  label: 'السقف',      hint: 'سقف السيارة' },
] as const

type SlotKey = typeof GENERAL_SLOTS[number]['key']

// Shrink + JPEG-encode in the browser so full-res / HEIC phone photos stay
// under Gemini's token limit. Identical to the workshop analysis flow.
async function fileToCompressedDataUrl(file: File, maxDim = 1600, quality = 0.8): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.readAsDataURL(file)
    })
  }
}

export default function BrokerFnol() {
  const { token = '' } = useParams()
  const [screen, setScreen] = useState<Screen>('loading')
  const [broker, setBroker] = useState<Broker | null>(null)

  // Form fields
  const [vin, setVin]                 = useState('')
  // Egyptian plate: 3 letters + 4 digits, entered as separate boxes.
  const [plateLetters, setPlateLetters] = useState(['', '', ''])
  const [plateNumbers, setPlateNumbers] = useState(['', '', '', ''])
  const [platePhoto, setPlatePhoto]   = useState<File | null>(null)
  const [customerMobile, setMobile]   = useState('')
  const [location, setLocation]       = useState('')
  const [vehicleMake, setMake]        = useState('')
  const [vehicleModel, setModel]      = useState('')
  const [vehicleYear, setYear]        = useState('')
  const [general, setGeneral]         = useState<Record<SlotKey, File | null>>(
    { front: null, back: null, right: null, left: null, roof: null },
  )
  const [damageImages, setDamage]     = useState<File[]>([])
  const [video, setVideo]             = useState<File | null>(null)
  const [docs, setDocs]               = useState<File[]>([])

  const [progress, setProgress] = useState('')
  const [error, setError]       = useState('')
  const [report, setReport]     = useState<any>(null)  // grouped قطع غيار report shown on success
  const [fnolId, setFnolId]     = useState<string | null>(null)  // for the booking step
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [claimCopied, setClaimCopied] = useState(false)
  // Self-contained video upload — starts the moment a video is picked, fully
  // independent of the analysis/submit flow.
  const [videoPath, setVideoPath]         = useState<string | null>(null)
  const [videoPct, setVideoPct]           = useState<number | null>(null)
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoError, setVideoError]       = useState('')
  const videoUploadRef = useRef<Promise<string | null> | null>(null)

  // Derived plate value (e.g. "أ ب ج 1234") + completeness (3 letters + ≥3 digits).
  const vehicleLicense = [plateLetters.filter(Boolean).join(' '), plateNumbers.filter(Boolean).join('')].filter(Boolean).join(' ')
  const plateComplete = plateLetters.filter(Boolean).length >= 2 && plateNumbers.filter(Boolean).length >= 3

  // Validate the link token on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/api/broker/link/${encodeURIComponent(token)}`))
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.broker) { setScreen('invalid'); return }
        setBroker(data.broker)
        setScreen('form')
      } catch {
        if (!cancelled) setScreen('invalid')
      }
    })()
    return () => { cancelled = true }
  }, [token])

  // Upload a batch of files to the broker docs bucket, return signed URLs.
  async function uploadFiles(files: File[]): Promise<string[]> {
    if (files.length === 0) return []
    const fd = new FormData()
    if (broker) fd.append('broker_id', broker.id)
    files.forEach(f => fd.append('docs', f))
    const res = await fetch(apiUrl('/api/broker/upload-docs'), { method: 'POST', body: fd })
    if (!res.ok) throw new Error('فشل رفع الملفات')
    const data = await res.json()
    return data.urls || []
  }

  // Upload a (large) video DIRECTLY to Supabase Storage via a signed URL, with a
  // progress %. Bypasses the API server so it isn't limited by request size/CORS.
  // Returns the storage path; the FNOL submit turns it into a signed URL.
  async function uploadVideoDirect(file: File, onProgress?: (pct: number) => void): Promise<string> {
    const ext = file.name.split('.').pop() || 'mp4'
    const r = await fetch(apiUrl('/api/broker/video-upload-url'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broker_id: broker?.id, ext }),
    })
    if (!r.ok) throw new Error('تعذّر بدء رفع الفيديو')
    const { signedUrl, path } = await r.json()

    await new Promise<void>((resolve, reject) => {
      const form = new FormData()
      form.append('cacheControl', '31536000')
      form.append('', file) // Supabase signed upload expects the file under the empty key
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', signedUrl)
      xhr.setRequestHeader('x-upsert', 'true')
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)) }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`فشل رفع الفيديو (${xhr.status})`))
      xhr.onerror = () => reject(new Error('فشل رفع الفيديو'))
      xhr.send(form)
    })
    return path
  }

  // Fired when a video is picked — uploads immediately & independently.
  const startVideoUpload = (file: File) => {
    setVideo(file); setVideoPath(null); setVideoError(''); setVideoUploading(true); setVideoPct(0)
    const p = uploadVideoDirect(file, setVideoPct)
      .then(path => { setVideoPath(path); setVideoUploading(false); setVideoPct(100); return path })
      .catch(err => { console.warn('Video upload failed:', err); setVideoError('فشل رفع الفيديو — حاول مرة أخرى'); setVideoUploading(false); setVideoPct(null); return null })
    videoUploadRef.current = p
  }

  // Run the shared wreck-vision analysis pipeline and group the result the way
  // the broker portal expects (repairable / replaceable / needsCheck).
  async function runAnalysis(generalFiles: File[], damageFiles: File[]): Promise<any | null> {
    const all = [...generalFiles, ...damageFiles]
    if (all.length === 0) return null
    const dataUrls: string[] = []
    for (const f of all) dataUrls.push(await fileToCompressedDataUrl(f))
    const rawImages = dataUrls.map(u => u.split(',')[1])

    const res = await fetch(apiUrl('/api/analysis'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: rawImages,
        vehicleInfo: {
          year: parseInt(vehicleYear) || 0,
          make: vehicleMake, model: vehicleModel,
          vin_number: vin.trim(),
          customer_mobile: customerMobile.trim(),
        },
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.success || !data.analysis) throw new Error(data.error || 'فشل تحليل الصور')

    const enriched = data.analysis
    const damages: any[] = enriched.damages || []
    // enrichAnalysisWithParts tags each part with severity_label ('Repair'|'Replace').
    const isReplace = (d: any) => (d.severity_label ?? d.severityDecision ?? (d.severityIndex >= 4 ? 'Replace' : 'Repair')) === 'Replace'
    return {
      ...enriched,
      broker_report: {
        repairable:  damages.filter(d => !isReplace(d)),
        replaceable: damages.filter(d => isReplace(d)),
        needsCheck:  enriched.needs_check_parts || [],
      },
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!vin.trim())    { setError('رقم الشاسيه (VIN) مطلوب'); return }
    if (!plateComplete) { setError('رقم لوحة السيارة مطلوب (٣ حروف و٣-٤ أرقام)'); return }
    if (!platePhoto)            { setError('صورة لوحة السيارة مطلوبة'); return }
    if (!broker) return

    const generalFiles = GENERAL_SLOTS.map(s => general[s.key]).filter(Boolean) as File[]
    if (generalFiles.length + damageImages.length === 0) {
      setError('يرجى رفع صورة واحدة على الأقل للسيارة أو الأضرار')
      return
    }

    setScreen('analyzing')
    try {
      // 1. Run the wreck-vision analysis pipeline (visible progress step).
      setProgress('جاري تحليل صور الأضرار...')
      let analysisResult: any = null
      try {
        analysisResult = await runAnalysis(generalFiles, damageImages)
        setReport(analysisResult)
      } catch (analysisErr) {
        // Never lose the claim if analysis hiccups — save it and let the broker
        // re-run analysis from the portal if needed.
        console.warn('Analysis failed, submitting FNOL without report:', analysisErr)
      }

      // 2. Upload photos/docs through the API (small files).
      setProgress('جاري رفع الصور...')
      const [generalUrls, damageUrls, plateUrls, docUrls] = await Promise.all([
        uploadFiles(generalFiles),
        uploadFiles(damageImages),
        uploadFiles([platePhoto]),
        uploadFiles(docs),
      ])

      // Video already uploaded on-select and independently; just grab its path
      // (await only if it's still finishing). Non-fatal.
      let videoPath: string | null = null
      if (video && videoUploadRef.current) {
        if (videoUploading) setProgress('جاري إنهاء رفع الفيديو...')
        videoPath = await videoUploadRef.current
      }

      // 3. Save the FNOL with everything attached.
      setProgress('جاري حفظ المطالبة...')
      const res = await fetch(apiUrl('/api/broker/fnol'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker_id: broker.id,
          vin: vin.trim(),
          vehicle_license: vehicleLicense.trim(),
          vehicle_license_photo: plateUrls[0] || null,
          customer_mobile: customerMobile.trim() || null,
          location: location.trim() || null,
          vehicle_make: vehicleMake.trim() || null,
          vehicle_model: vehicleModel.trim() || null,
          vehicle_year: vehicleYear.trim() || null,
          general_images: generalUrls,
          damage_images: damageUrls,
          doc_urls: docUrls,
          video_path: videoPath,
          analysis_result: analysisResult,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'فشل إرسال المطالبة')

      setFnolId(data.fnol_id)
      setUploadedImages([...generalUrls, ...damageUrls])

      // Notify a host app if we're embedded in an iframe.
      try {
        window.parent?.postMessage(
          { type: 'gfast:fnol-submitted', fnol_id: data.fnol_id, case_id: data.case_id, vin: vin.trim().toUpperCase() },
          '*',
        )
      } catch { /* not embedded — ignore */ }

      setScreen('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ. برجاء المحاولة مرة أخرى.')
      setScreen('form')
    }
  }

  // ── Styles (mobile-first) ────────────────────────────────────────────────
  const page: React.CSSProperties = {
    minHeight: '100dvh', background: '#f3f4f6', display: 'flex',
    alignItems: 'flex-start', justifyContent: 'center', padding: 'clamp(12px, 3vw, 24px)',
    fontFamily: 'system-ui, -apple-system, sans-serif', direction: 'rtl',
    boxSizing: 'border-box', overflowX: 'hidden',
  }
  const card: React.CSSProperties = {
    background: 'white', borderRadius: 16, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
    padding: 'clamp(18px, 5vw, 28px)', width: '100%', maxWidth: 480, boxSizing: 'border-box',
    overflow: 'hidden',
  }
  const label: React.CSSProperties = {
    display: 'block', fontWeight: 600, color: '#374151', marginBottom: 6, fontSize: '.85rem',
  }
  const inp: React.CSSProperties = {
    width: '100%', padding: '.75rem .9rem', border: '2px solid #d1d5db',
    borderRadius: 8, fontSize: 16, outline: 'none', boxSizing: 'border-box', textAlign: 'right',
    WebkitAppearance: 'none', appearance: 'none',
  } as React.CSSProperties
  const field: React.CSSProperties = { marginBottom: 16 }

  // ── Non-form screens ─────────────────────────────────────────────────────
  if (screen === 'loading') {
    return <div style={page}><div style={{ ...card, textAlign: 'center', color: '#9ca3af', marginTop: 60 }}>جاري التحميل…</div></div>
  }
  if (screen === 'invalid') {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 12 }}>🔗</div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>الرابط غير متاح</h1>
          <p style={{ color: '#6b7280', fontSize: '.9rem', margin: 0 }}>
            هذا الرابط غير صالح أو لم يعد نشطًا. برجاء التواصل مع وسيط التأمين للحصول على رابط جديد.
          </p>
        </div>
      </div>
    )
  }
  if (screen === 'analyzing') {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: 'center', marginTop: 40 }}>
          <div style={{ width: 56, height: 56, border: '4px solid #e5e7eb', borderTopColor: '#3F3D9E', borderRadius: '50%', margin: '0 auto 18px', animation: 'gfspin 1s linear infinite' }} />
          <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>{progress || 'جاري المعالجة...'}</h1>
          <p style={{ color: '#6b7280', fontSize: '.85rem', margin: 0 }}>قد تستغرق هذه الخطوة حتى 30 ثانية، برجاء عدم إغلاق الصفحة.</p>
          <style>{`@keyframes gfspin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }
  if (screen === 'success') {
    return (
      <div style={page}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <div style={{ ...card, textAlign: 'center', marginBottom: 16 }}>
            <div style={{ width: 60, height: 60, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '1.8rem' }}>✅</div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>تم استلام مطالبتك</h1>
            <p style={{ color: '#6b7280', fontSize: '.9rem', margin: 0 }}>
              شكرًا لك. تم إرسال تفاصيل المطالبة وتقرير الأضرار إلى <strong>{broker?.company}</strong>، وسيتم التواصل معك بخصوص الخطوات التالية.
            </p>
            {fnolId && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: '.78rem', color: '#6b7280' }}>رقم المطالبة — احتفظ به للرجوع وحجز ورشة لاحقًا</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#3F3D9E', fontSize: '.95rem', wordBreak: 'break-all', margin: '4px 0 10px' }}>{fnolId}</div>
                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/claim/${fnolId}`); setClaimCopied(true); setTimeout(() => setClaimCopied(false), 2000) }}
                  style={{ padding: '.5rem 1rem', background: claimCopied ? '#16a34a' : '#3F3D9E', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }}>
                  {claimCopied ? '✅ تم نسخ رابط المتابعة' : '📋 نسخ رابط متابعة المطالبة'}
                </button>
              </div>
            )}
          </div>
          {report && <DamageReport report={report} />}
          <BookingStep
            fnolId={fnolId}
            customerMobile={customerMobile.trim()}
            vehicle={{ make: vehicleMake.trim(), model: vehicleModel.trim(), year: vehicleYear.trim() }}
            imageUrls={uploadedImages}
          />
        </div>
      </div>
    )
  }

  // Every field is required to submit EXCEPT the documents (مستندات).
  // General photos: only the front angle is required; the rest are optional.
  const hasFrontPhoto = !!general.front
  // Photos: only the front angle is required; damage photos + other angles are optional.
  const isComplete = !!(
    vin.trim() && plateComplete && platePhoto &&
    customerMobile.trim() && location.trim() &&
    vehicleMake.trim() && vehicleModel.trim() && vehicleYear.trim() &&
    hasFrontPhoto
  )

  // ── Form ────────────────────────────────────────────────────────────────
  return (
    <div style={page}>
      {/* Global mobile guards: never allow horizontal scroll on the customer journey */}
      <style>{`html,body,#root{margin:0;max-width:100%;overflow-x:hidden}
        input,button,select,textarea{max-width:100%}`}</style>
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg, #3F3D9E, #6366f1)', borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: '1.6rem' }}>🚗</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#111827', margin: 0 }}>الإبلاغ عن حادث</h1>
          <p style={{ color: '#6b7280', fontSize: '.85rem', marginTop: 6 }}>
            {broker?.company} · بلاغ أولي عن الحادث
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={field}>
            <label style={label}>رقم الشاسيه (VIN) *</label>
            <input style={{ ...inp, textTransform: 'uppercase', letterSpacing: '.5px' }}
              value={vin} onChange={e => setVin(e.target.value)}
              placeholder="رقم الشاسيه من على الرخصة" maxLength={17} required />
          </div>

          <div style={field}>
            <label style={label}>رقم لوحة السيارة *</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <PlateBoxes letters={plateLetters} numbers={plateNumbers} onLetters={setPlateLetters} onNumbers={setPlateNumbers} />
              </div>
              {/* Mandatory plate photo — small camera icon / thumbnail */}
              <label title="صورة اللوحة (مطلوبة)" style={{
                width: 48, height: 48, flexShrink: 0, borderRadius: 8, cursor: 'pointer', overflow: 'hidden',
                border: `2px ${platePhoto ? 'solid #16a34a' : 'dashed #f59e0b'}`,
                background: platePhoto ? '#000' : '#fffbeb', position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) setPlatePhoto(f) }} />
                {platePhoto
                  ? <img src={URL.createObjectURL(platePhoto)} alt="لوحة" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '1.25rem' }}>📷</span>}
              </label>
            </div>
            {!platePhoto && <div style={{ fontSize: '.72rem', color: '#b45309', marginTop: 6 }}>صورة اللوحة مطلوبة — اضغط على أيقونة الكاميرا</div>}
          </div>

          <div style={field}>
            <label style={label}>رقم الموبايل *</label>
            <input style={inp} type="tel" inputMode="tel" value={customerMobile}
              onChange={e => setMobile(e.target.value)} placeholder="01xxxxxxxxx" />
          </div>

          <div style={field}>
            <label style={label}>المكان / المدينة *</label>
            <input style={inp} value={location} onChange={e => setLocation(e.target.value)}
              placeholder="أين وقع الحادث؟" />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...field, flex: '1 1 40%', minWidth: 110 }}>
              <label style={label}>الماركة *</label>
              <input style={inp} value={vehicleMake} onChange={e => setMake(e.target.value)} placeholder="تويوتا" />
            </div>
            <div style={{ ...field, flex: '1 1 40%', minWidth: 110 }}>
              <label style={label}>الموديل *</label>
              <input style={inp} value={vehicleModel} onChange={e => setModel(e.target.value)} placeholder="كورولا" />
            </div>
            <div style={{ ...field, flex: '1 1 80px', minWidth: 80 }}>
              <label style={label}>السنة *</label>
              <input style={inp} type="number" inputMode="numeric" value={vehicleYear} onChange={e => setYear(e.target.value)} placeholder="2022" />
            </div>
          </div>

          {/* Guided general photos — only the front angle is required */}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>صور السيارة (الصورة الأمامية مطلوبة، والباقي اختياري)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {GENERAL_SLOTS.map(slot => (
                <PhotoTile
                  key={slot.key}
                  file={general[slot.key]}
                  onPick={f => setGeneral(g => ({ ...g, [slot.key]: f }))}
                  label={slot.label}
                  hint={slot.hint}
                  required={slot.key === 'front'}
                />
              ))}
            </div>
          </div>

          {/* Damage photos */}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>صور الأضرار (لقطات قريبة) — اختياري</label>
            <MultiPhoto files={damageImages} onChange={setDamage} />
          </div>

          {/* Video — uploads on its own the moment it's picked */}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>فيديو للسيارة — تأكد من تصوير السيارة بالكامل ورقم السيارة والعداد إن أمكن</label>
            <input type="file" accept="video/*" capture="environment"
              onChange={e => { const f = e.target.files?.[0]; if (f) startVideoUpload(f) }}
              style={{ width: '100%', maxWidth: '100%', fontSize: '.85rem', color: '#6b7280', boxSizing: 'border-box' }} />
            {video && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: '.78rem', color: '#374151', fontWeight: 600 }}>🎬 {video.name} ({(video.size / (1024 * 1024)).toFixed(1)}MB)</div>
                {videoUploading && (
                  <>
                    <div style={{ fontSize: '.74rem', color: '#6b7280', margin: '4px 0 3px' }}>جاري رفع الفيديو {videoPct ?? 0}%</div>
                    <div style={{ height: 6, background: '#eef2ff', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${videoPct ?? 0}%`, height: '100%', background: '#3F3D9E', transition: 'width .2s' }} />
                    </div>
                  </>
                )}
                {videoPath && !videoUploading && <div style={{ fontSize: '.74rem', color: '#059669', marginTop: 3, fontWeight: 600 }}>✅ تم رفع الفيديو</div>}
                {videoError && (
                  <div style={{ fontSize: '.74rem', color: '#dc2626', marginTop: 3, fontWeight: 600 }}>
                    ⚠️ {videoError} <button type="button" onClick={() => startVideoUpload(video)} style={{ background: 'none', border: 'none', color: '#3F3D9E', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: '.74rem' }}>إعادة</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Documents */}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>مستندات (رخصة، بطاقة تأمين…) — اختياري</label>
            <input type="file" accept="image/*,application/pdf" multiple
              onChange={e => setDocs(Array.from(e.target.files || []))}
              style={{ width: '100%', maxWidth: '100%', fontSize: '.85rem', color: '#6b7280', boxSizing: 'border-box' }} />
            {docs.length > 0 && (
              <div style={{ fontSize: '.78rem', color: '#059669', marginTop: 4, fontWeight: 600 }}>{docs.length} ملف مرفق</div>
            )}
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '.7rem 1rem', marginBottom: 16, color: '#dc2626', fontSize: '.85rem', fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" disabled={!isComplete}
            style={{ width: '100%', minHeight: 50, padding: '.9rem', background: isComplete ? '#3F3D9E' : '#c7c9e8', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 16, cursor: isComplete ? 'pointer' : 'not-allowed', opacity: isComplete ? 1 : 0.7, transition: 'background .2s, opacity .2s', WebkitTapHighlightColor: 'transparent' }}>
            إرسال المطالبة
          </button>
          {!isComplete && (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '.75rem', margin: '8px 0 0' }}>
              يرجى استكمال جميع الحقول
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

// Grouped قطع غيار report — identical grouping/labels to the broker portal,
// fed by the same wreck-vision analysis pipeline (@gfast/analysis-core).
export function DamageReport({ report }: { report: any }) {
  const partName = (d: any) => d.part_name_ar || d.part_name_en || d.nameAr || d.nameEn || d.partName || d.part || 'قطعة غير محددة'

  const rep = report?.broker_report
  let repairable: any[], replaceable: any[]
  if (rep) {
    repairable = rep.repairable || []; replaceable = rep.replaceable || []
  } else {
    const damages: any[] = report?.damages || []
    const isReplace = (d: any) => (d.severity_label ?? d.severityDecision ?? (d.severityIndex >= 4 ? 'Replace' : 'Repair')) === 'Replace'
    repairable = damages.filter(d => !isReplace(d)); replaceable = damages.filter(d => isReplace(d))
  }
  // "تحتاج فحص" (needsCheck) is intentionally hidden from the customer report.
  const total = repairable.length + replaceable.length

  const cardStyle: React.CSSProperties = { background: 'white', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden', marginBottom: 14 }

  const Section = ({ items, title, color, dot }: { items: any[]; title: string; color: string; dot: string }) => (
    items.length === 0 ? null : (
      <div style={cardStyle} dir="rtl">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '.92rem', color }}>{title} ({items.length})</div>
        <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
          {items.map((d, i) => (
            <li key={i} style={{ padding: '10px 18px', borderBottom: i < items.length - 1 ? '1px solid #f8fafc' : 'none' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '.92rem', color: '#111827' }}>
                <span style={{ color: dot }}>●</span> {partName(d)}
              </span>
              {d.description && <div style={{ marginTop: 5, fontSize: '.82rem', color: '#6b7280', lineHeight: 1.6 }}>{d.description}</div>}
            </li>
          ))}
        </ul>
      </div>
    )
  )

  return (
    <div dir="rtl">
      <div style={{ ...cardStyle, padding: '14px 18px', textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111827' }}>📋 تقرير الأضرار المبدئي</div>
        <div style={{ fontSize: '.8rem', color: '#6b7280', marginTop: 3 }}>{total > 0 ? `تم رصد ${total} قطعة` : 'لم يتم رصد أضرار واضحة في الصور'}</div>
      </div>
      <Section items={repairable}  title="🔧 قطع قابلة للإصلاح" color="#15803d" dot="#16a34a" />
      <Section items={replaceable} title="🔨 قطع تحتاج استبدال"  color="#b91c1c" dot="#dc2626" />
    </div>
  )
}

// Map known workshop badge labels to Arabic; fall back to the raw label.
const BADGE_AR: Record<string, string> = {
  'Certified Center': 'مركز معتمد',
  'EV': 'سيارات كهربائية',
  'Installments': 'تقسيط',
  'PDR': 'إصلاح على البارد',
  'Best Value': 'أفضل سعر',
}
const badgeAr = (b: string) => BADGE_AR[b] || b

// After the report, let the customer book a workshop — same booking backend as
// wreck-vision (GET /api/public/workshops → POST /api/public/booking with fnol_id,
// which advances the broker case to "booked" and notifies workshop + broker).
export function BookingStep({ fnolId, customerMobile, vehicle, imageUrls }: {
  fnolId: string | null
  customerMobile: string
  vehicle: { make: string; model: string; year: string }
  imageUrls: string[]
}) {
  const [workshops, setWorkshops] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [openId, setOpenId]       = useState<string | null>(null)
  const [branchId, setBranchId]   = useState<string | null>(null)
  const [date, setDate]           = useState('')
  const [booking, setBooking]     = useState(false)
  const [booked, setBooked]       = useState<any>(null)
  const [err, setErr]             = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl('/api/public/workshops'))
        const data = await res.json()
        if (!cancelled) setWorkshops(data.workshops || [])
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  async function confirm(ws: any) {
    setErr('')
    setBooking(true)
    try {
      const res = await fetch(apiUrl('/api/public/booking'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workshop_id: ws.workshop_id,
          branch_id: branchId || null,
          customer_mobile: customerMobile,
          image_urls: imageUrls,
          vehicle_make: vehicle.make || null,
          vehicle_model: vehicle.model || null,
          vehicle_year: vehicle.year || null,
          scheduled_date: date || null,
          fnol_id: fnolId,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'فشل الحجز')
      setBooked({ ws, branch: (ws.branches || []).find((b: any) => b.branch_id === branchId) || null })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فشل الحجز، برجاء المحاولة مرة أخرى')
    } finally { setBooking(false) }
  }

  const card: React.CSSProperties = { background: 'white', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)', overflow: 'hidden', marginBottom: 14 }

  if (booked) {
    return (
      <div style={{ ...card, padding: '20px 18px', textAlign: 'center' }} dir="rtl">
        <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>🏢✅</div>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#111827' }}>تم حجز الورشة</div>
        <div style={{ color: '#6b7280', fontSize: '.85rem', marginTop: 4 }}>
          {booked.ws.display_name || booked.ws.workshop_name}{booked.branch ? ` — ${booked.branch.branch_name}` : ''}
          {date ? ` · ${date}` : ''}
        </div>
        <div style={{ color: '#6b7280', fontSize: '.8rem', marginTop: 8 }}>ستتواصل معك الورشة لتأكيد موعد الإصلاح.</div>
      </div>
    )
  }

  return (
    <div dir="rtl">
      <div style={{ ...card, padding: '14px 18px', textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111827' }}>🔧 احجز ورشة لإصلاح سيارتك</div>
        <div style={{ fontSize: '.8rem', color: '#6b7280', marginTop: 3 }}>اختر الورشة الأقرب إليك لبدء الإصلاح</div>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 30, textAlign: 'center', color: '#9ca3af' }}>جاري تحميل الورش…</div>
      ) : workshops.length === 0 ? (
        <div style={{ ...card, padding: 30, textAlign: 'center', color: '#9ca3af' }}>لا توجد ورش متاحة حاليًا.</div>
      ) : (
        workshops.map(ws => {
          const open = openId === ws.workshop_id
          return (
            <div key={ws.workshop_id} style={card}>
              <button type="button"
                onClick={() => { setOpenId(open ? null : ws.workshop_id); setBranchId(null); setErr('') }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: open ? '#f5f3ff' : 'white', border: 'none', cursor: 'pointer', textAlign: 'right' }}>
                {ws.logo_url
                  ? <img src={ws.logo_url} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 44, height: 44, borderRadius: 10, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>🏢</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#111827' }}>{ws.display_name || ws.workshop_name}</div>
                  <div style={{ fontSize: '.8rem', color: '#6b7280', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                    {ws.city && <span>📍 {ws.city}</span>}
                    {ws.stars ? <span>⭐ {ws.stars}</span> : null}
                    {ws.accepts_insurance && <span style={{ color: '#15803d' }}>✓ يقبل التأمين</span>}
                  </div>
                  {/* Flags/badges + Google reviews link */}
                  {(ws.is_new || (ws.badges || []).length > 0 || ws.google_place_id) && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                      {ws.is_new && <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, padding: '2px 8px' }}>🆕 جديد</span>}
                      {(ws.badges || []).map((b: string) => (
                        <span key={b} style={{ fontSize: '.68rem', fontWeight: 700, color: '#5b21b6', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 999, padding: '2px 8px' }}>{badgeAr(b)}</span>
                      ))}
                      {ws.google_place_id && (
                        <span
                          onClick={(e) => { e.stopPropagation(); window.open(`https://search.google.com/local/reviews?placeid=${ws.google_place_id}`, '_blank', 'noopener') }}
                          style={{ fontSize: '.68rem', fontWeight: 700, color: '#1d4ed8', textDecoration: 'underline', cursor: 'pointer' }}>
                          ⭐ تقييمات Google
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span style={{ color: '#9ca3af', fontSize: '1.1rem' }}>{open ? '▲' : '▼'}</span>
              </button>

              {open && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f1f5f9' }}>
                  {(ws.branches || []).length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '.8rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>اختر الفرع</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {ws.branches.map((b: any) => (
                          <button key={b.branch_id} type="button" onClick={() => setBranchId(b.branch_id)}
                            style={{ padding: '7px 12px', borderRadius: 999, fontSize: '.8rem', fontWeight: 600, cursor: 'pointer',
                              border: `1.5px solid ${branchId === b.branch_id ? '#3F3D9E' : '#e5e7eb'}`,
                              background: branchId === b.branch_id ? '#ede9fe' : 'white', color: branchId === b.branch_id ? '#3F3D9E' : '#374151' }}>
                            {b.branch_name}{b.city ? ` · ${b.city}` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: '.8rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>موعد الحضور (اختياري)</div>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                      style={{ width: '100%', padding: '.65rem .8rem', border: '2px solid #d1d5db', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} />
                  </div>

                  {err && <div style={{ color: '#dc2626', fontSize: '.8rem', marginTop: 10, fontWeight: 600 }}>⚠️ {err}</div>}

                  <button type="button" disabled={booking} onClick={() => confirm(ws)}
                    style={{ width: '100%', minHeight: 46, marginTop: 12, background: booking ? '#a5b4fc' : '#3F3D9E', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: booking ? 'not-allowed' : 'pointer' }}>
                    {booking ? 'جاري الحجز…' : 'تأكيد الحجز'}
                  </button>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// Egyptian plate entry: 3 letter boxes + 4 digit boxes with auto-advance focus.
function PlateBoxes({ letters, numbers, onLetters, onNumbers }: {
  letters: string[]; numbers: string[]
  onLetters: (v: string[]) => void; onNumbers: (v: string[]) => void
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]) // 0-2 letters, 3-6 numbers
  const focus = (i: number) => { if (i >= 0 && i < 7) refs.current[i]?.focus() }

  const setLetter = (idx: number, val: string) => {
    const ch = val.slice(-1)
    const next = [...letters]; next[idx] = ch; onLetters(next)
    if (ch) focus(idx + 1)
  }
  const setNumber = (idx: number, val: string) => {
    const digit = val.replace(/[^0-9]/g, '').slice(-1)
    const next = [...numbers]; next[idx] = digit; onNumbers(next)
    if (digit) focus(3 + idx + 1)
  }
  const onKey = (gi: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !(e.target as HTMLInputElement).value) focus(gi - 1)
  }

  const box: React.CSSProperties = {
    width: '100%', minWidth: 0, height: 44, textAlign: 'center', fontSize: 18, fontWeight: 700,
    border: '2px solid #d1d5db', borderRadius: 8, outline: 'none', boxSizing: 'border-box', padding: 0,
    WebkitAppearance: 'none', appearance: 'none',
  } as React.CSSProperties

  const cell = (gi: number, value: string, onChange: (v: string) => void, numeric: boolean) => (
    <input key={gi} ref={el => { refs.current[gi] = el }} value={value}
      onChange={e => onChange(e.target.value)} onKeyDown={e => onKey(gi, e)}
      maxLength={1} inputMode={numeric ? 'numeric' : 'text'} style={box} />
  )

  const groupLabel: React.CSSProperties = { fontSize: '.7rem', color: '#6b7280', fontWeight: 700, textAlign: 'center', marginBottom: 4 }

  // RTL: first group renders on the RIGHT (letters), last on the LEFT (numbers).
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
      <div style={{ flex: '3 1 0', minWidth: 0 }}>
        <div style={groupLabel}>حروف</div>
        <div style={{ display: 'flex', gap: 4, minWidth: 0 }}>
          {letters.map((v, i) => cell(i, v, val => setLetter(i, val), false))}
        </div>
      </div>
      <span style={{ height: 44, display: 'flex', alignItems: 'center', color: '#9ca3af', fontWeight: 700 }}>·</span>
      <div style={{ flex: '4 1 0', minWidth: 0 }}>
        <div style={groupLabel}>أرقام</div>
        <div style={{ display: 'flex', gap: 4, minWidth: 0 }}>
          {numbers.map((v, i) => cell(3 + i, v, val => setNumber(i, val), true))}
        </div>
      </div>
    </div>
  )
}

// A single tappable photo tile: shows a thumbnail once a photo is chosen.
function PhotoTile({ file, onPick, label, hint, required }: {
  file: File | null; onPick: (f: File) => void; label: string; hint?: string; required?: boolean
}) {
  const preview = file ? URL.createObjectURL(file) : null
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 4, aspectRatio: '1 / 1', borderRadius: 10, cursor: 'pointer', overflow: 'hidden',
      border: `2px ${file ? 'solid' : 'dashed'} ${file ? '#16a34a' : required ? '#f59e0b' : '#d1d5db'}`,
      background: file ? '#000' : '#f9fafb', position: 'relative', textAlign: 'center',
    }}>
      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f) }} />
      {preview ? (
        <>
          <img src={preview} alt={label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,.55)', color: 'white', fontSize: '.68rem', fontWeight: 700, padding: '2px 0' }}>✓ {label}</div>
        </>
      ) : (
        <>
          <span style={{ fontSize: '1.3rem' }}>📷</span>
          <span style={{ fontSize: '.72rem', fontWeight: 700, color: required ? '#b45309' : '#374151' }}>{label}</span>
          {hint && <span style={{ fontSize: '.6rem', color: '#9ca3af', lineHeight: 1.2 }}>{hint}</span>}
        </>
      )}
    </label>
  )
}

// Multi-photo picker with a thumbnail strip + add button.
function MultiPhoto({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {files.map((f, i) => (
        <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))}
            style={{ position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: 'white', fontSize: '.7rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
      ))}
      <label style={{
        width: 72, height: 72, borderRadius: 8, border: '2px dashed #d1d5db', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280', background: '#f9fafb',
      }}>
        <input type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
          onChange={e => { const picked = Array.from(e.target.files || []); if (picked.length) onChange([...files, ...picked]) }} />
        <span style={{ fontSize: '1.2rem' }}>＋</span>
        <span style={{ fontSize: '.62rem', fontWeight: 700 }}>إضافة</span>
      </label>
    </div>
  )
}

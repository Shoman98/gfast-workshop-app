import express from 'express'
import { runAndEnrich } from '../lib/analysisPipeline.js'

const router = express.Router()

const WHATSAPP_TOKEN  = process.env.WHATSAPP_ACCESS_TOKEN
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const VERIFY_TOKEN    = process.env.WHATSAPP_VERIFY_TOKEN || 'gfast_secret_2024'

// In-memory sessions per phone number
// phone → { state, vehicleInfo, images[], lastActivity }
const sessions = new Map()

// Clean sessions older than 2 hours every 30 min
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000
  for (const [phone, s] of sessions) {
    if (s.lastActivity < cutoff) sessions.delete(phone)
  }
}, 30 * 60 * 1000)

// ── GET: Meta webhook verification ──────────────────────────────────────────
router.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified')
    return res.status(200).send(challenge)
  }
  res.sendStatus(403)
})

// ── POST: Incoming messages ──────────────────────────────────────────────────
router.post('/', async (req, res) => {
  res.sendStatus(200) // always ack Meta immediately

  try {
    const messages = req.body?.entry?.[0]?.changes?.[0]?.value?.messages
    if (!messages?.length) return
    const msg = messages[0]
    await handleMessage(msg.from, msg.type, msg)
  } catch (err) {
    console.error('❌ WhatsApp webhook error:', err.message)
  }
})

// ── Message handler ──────────────────────────────────────────────────────────
const GREETINGS = ['مرحبا', 'مرحبًا', 'هلا', 'ابدأ', 'بداية', 'start', 'hi', 'hello']

async function handleMessage(phone, type, msg) {
  let session = sessions.get(phone) ?? { state: 'start', vehicleInfo: null, images: [] }
  session.lastActivity = Date.now()

  const text = type === 'text' ? msg.text.body.trim() : ''

  // Reset on greeting
  if (type === 'text' && GREETINGS.some(g => text.toLowerCase().includes(g))) {
    sessions.delete(phone)
    await send(phone, `👋 أهلاً بك في *G-Fast*!\n\nأرسل بيانات السيارة للبدء:\n*الماركة الموديل السنة*\n\nمثال: تويوتا كامري 2021`)
    return
  }

  // ── state: start ────────────────────────────────────────────────────────────
  if (session.state === 'start') {
    if (type === 'text') {
      const vehicle = parseVehicle(text)
      if (vehicle) {
        session.vehicleInfo = vehicle
        session.state = 'collecting_images'
        session.images = []
        sessions.set(phone, session)
        await send(phone, `✅ *${vehicle.make} ${vehicle.model} ${vehicle.year}*\n\nأرسل صور السيارة الآن.\n💡 أرسلها كـ *ملفات* مش صور عادية للحصول على جودة أفضل.\n\nلما تخلص أرسل *تحليل*`)
      } else {
        await send(phone, `👋 أهلاً! أرسل بيانات السيارة بالشكل ده:\n\n*الماركة الموديل السنة*\nمثال: تويوتا كامري 2021`)
      }
    } else if (type === 'image' || type === 'document') {
      await send(phone, `👋 أهلاً! قبل الصور، أرسل بيانات السيارة:\n\n*الماركة الموديل السنة*\nمثال: تويوتا كامري 2021`)
    }
    return
  }

  // ── state: collecting_images ─────────────────────────────────────────────
  if (session.state === 'collecting_images') {
    if (type === 'text') {
      if (text === 'تحليل' || text === 'analyze') {
        if (session.images.length === 0) {
          await send(phone, '⚠️ لازم ترسل صورة واحدة على الأقل أولاً.')
          return
        }
        session.state = 'analyzing'
        sessions.set(phone, session)
        await send(phone, `🔄 جاري تحليل *${session.images.length}* صورة... انتظر لحظة`)
        await runAnalysisAndReply(phone, session)
      } else {
        await send(phone, `📸 عندك *${session.images.length}* صورة حتى الآن.\nأرسل المزيد أو أرسل *تحليل* للبدء.`)
      }
      return
    }

    if (type === 'image' || type === 'document') {
      const mediaId = type === 'image' ? msg.image?.id : msg.document?.id
      const mime    = type === 'image' ? msg.image?.mime_type : msg.document?.mime_type
      if (!mediaId) return
      if (type === 'document' && !mime?.startsWith('image/')) {
        await send(phone, '⚠️ الملف ده مش صورة، أرسل صور السيارة فقط.')
        return
      }
      try {
        const base64 = await downloadMedia(mediaId)
        session.images.push(base64)
        sessions.set(phone, session)
        await send(phone, `📸 تم استلام الصورة (${session.images.length}). أرسل المزيد أو أرسل *تحليل* للبدء.`)
      } catch {
        await send(phone, '⚠️ مش قادر أفتح الصورة، حاول تاني.')
      }
      return
    }
  }

  // ── state: analyzing ────────────────────────────────────────────────────
  if (session.state === 'analyzing') {
    await send(phone, '⏳ التحليل شغال دلوقتي، انتظر قليلاً...')
  }
}

// ── Analysis runner ──────────────────────────────────────────────────────────
async function runAnalysisAndReply(phone, session) {
  try {
    const result = await runAndEnrich(session.images, session.vehicleInfo)
    const report = formatReport(result, session.vehicleInfo)
    await send(phone, report)
  } catch (err) {
    console.error('❌ WhatsApp analysis error:', err.message)
    await send(phone, '❌ حصل خطأ أثناء التحليل، حاول تاني بعد شوية.')
  } finally {
    sessions.delete(phone)
  }
}

// ── Report formatter ─────────────────────────────────────────────────────────
function formatReport(analysis, vehicleInfo) {
  const replace = (analysis.damages || []).filter(d => d.severity_label === 'Replace')
  const repair  = (analysis.damages || []).filter(d => d.severity_label === 'Repair')
  const check   = analysis.needs_check_parts || []

  let msg = `🚗 *تقرير تحليل الأضرار*\n`
  msg += `${vehicleInfo.make} ${vehicleInfo.model} ${vehicleInfo.year}\n`
  msg += `━━━━━━━━━━━━━━━━━━\n\n`

  if (replace.length > 0) {
    msg += `🔴 *استبدال (${replace.length}):*\n`
    replace.forEach(p => { msg += `• ${p.part_name_ar}\n` })
    msg += '\n'
  }

  if (repair.length > 0) {
    msg += `🟡 *إصلاح (${repair.length}):*\n`
    repair.forEach(p => {
      const badge = p.repair_subtype ? ` [${p.repair_subtype}]` : ''
      msg += `• ${p.part_name_ar}${badge}\n`
    })
    msg += '\n'
  }

  if (check.length > 0) {
    msg += `⚠️ *تحتاج فحص (${check.length}):*\n`
    check.forEach(p => { msg += `• ${p.part_name_ar}\n` })
    msg += '\n'
  }

  if (replace.length === 0 && repair.length === 0 && check.length === 0) {
    msg += `✅ لم يتم اكتشاف أضرار واضحة\n\n`
  }

  msg += `━━━━━━━━━━━━━━━━━━\n_G-Fast تحليل ذكي للسيارات_ 🔧`
  return msg
}

// ── Vehicle info parser ───────────────────────────────────────────────────────
function parseVehicle(text) {
  const parts = text.trim().split(/\s+/)
  if (parts.length < 2) return null

  const yearPart = parts.find(p => /^(?:19|20)\d{2}$/.test(p))
  if (!yearPart) return null

  const rest = parts.filter(p => p !== yearPart)
  if (rest.length < 2) return null

  return { make: rest[0], model: rest.slice(1).join(' '), year: parseInt(yearPart) }
}

// ── WhatsApp API helpers ─────────────────────────────────────────────────────
async function downloadMedia(mediaId) {
  const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
  })
  const { url } = await metaRes.json()
  if (!url) throw new Error('No media URL from Meta')

  const imgRes = await fetch(url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } })
  const buf = Buffer.from(await imgRes.arrayBuffer())
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

async function send(phone, text) {
  try {
    await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
    })
  } catch (err) {
    console.error('❌ Failed to send WhatsApp message:', err.message)
  }
}

export default router

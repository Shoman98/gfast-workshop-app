/**
 * Telegram notifications for the workshop app.
 * Fire-and-forget: never blocks or fails the request that triggers it.
 */

// Fallback to shared G-Fast bot so notifications work even without env vars.
const DEFAULT_BOT_TOKEN = '8617956158:AAGr57MbJVRLcpaOujhBO1gte4SWPihyUyA';
const DEFAULT_CHAT_IDS = '8445166730,1174597745';

function getTelegramConfig(env) {
  const botToken = (env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN).trim();
  const chatIds = (env.TELEGRAM_CHAT_IDS || DEFAULT_CHAT_IDS)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return { botToken, chatIds };
}

function escapeTelegramMarkdown(value) {
  return String(value).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// Pre-filled messages the workshop sends the customer on WhatsApp.
const ANALYSIS_WA_MESSAGE =
  'اهلا بيك معاك حسين من G-Fast بتواصل معاك بخصوص تفاصيل التلفيات هل في اي مشكله؟ و لو حابب تحجز مركز للاصلاح انا معاك';
const BOOKING_WA_MESSAGE =
  'اهلا بيك معاك حسين من G-Fast باكد مع حضرتك حجز المركز و لو محتاج اي مساعده اخري';

// Normalise a stored mobile into a wa.me-ready number (Egyptian default).
function toWaNumber(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);          // 0020… → 20…
  if (d.startsWith('20')) return d;                // already country-coded
  if (d.startsWith('0')) return '20' + d.slice(1); // national trunk 0 → 20…
  return '20' + d;                                 // bare 1XXXXXXXXX
}

// Build a click-to-chat wa.me link (message percent-encoded → safe in MarkdownV2).
function customerWaLink(mobile, message) {
  const num = toWaNumber(mobile);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

// Workshop WhatsApp numbers for the "new booking" alert (keyed by workshop_id).
// These override the DB phone; any other workshop falls back to payload.workshop_phone.
const WORKSHOP_WA_NUMBERS = {
  'alamia-001':    '01022233970', // مركز العالمية
  'workshop-004':  '01013396004', // FixLane
  'noor-auto-001': '01227657672', // نور أوتو
  'elaksa01':      '01000275057', // الأقصى / ACA
};

// Link that opens the WORKSHOP's WhatsApp, prefilled with the new-booking notice.
function workshopWaLink(payload) {
  const num = toWaNumber(WORKSHOP_WA_NUMBERS[payload.workshop_id] || payload.workshop_phone);
  if (!num) return null;
  const msg = `تم حجز عميل جديد للمركز برقم ${payload.customer_mobile || ''}`.trim();
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

function formatScheduledDate(value) {
  if (!value) return '-';
  // value is "YYYY-MM-DD" — parse as local midnight to avoid timezone shifts
  const date = new Date(value + 'T00:00:00');
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatEgyptDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(',', '');
}

async function sendTelegramMessage(text, env) {
  const { botToken, chatIds } = getTelegramConfig(env);
  if (!botToken || chatIds.length === 0) {
    return { sent: false, reason: 'Telegram config missing' };
  }

  await Promise.allSettled(
    chatIds.map(async (chatId) => {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true,
          }),
        },
      );
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram send failed for ${chatId}: ${body}`);
      }
    }),
  );

  return { sent: true };
}

function formatWorkshopAnalysisMessage(payload) {
  const vehicle =
    [payload.year, payload.make, payload.model].filter(Boolean).join(' ') || '-';
  const waLink = customerWaLink(payload.customer_mobile, ANALYSIS_WA_MESSAGE);
  return [
    '🔍 *New Vehicle Analysis Started*',
    `Workshop: ${escapeTelegramMarkdown(payload.workshop_name || payload.workshop_id || '-')}`,
    `Customer: ${escapeTelegramMarkdown(payload.customer_name || '-')}`,
    `Mobile: ${escapeTelegramMarkdown(payload.customer_mobile || '-')}`,
    `Vehicle: ${escapeTelegramMarkdown(vehicle)}`,
    `VIN: ${escapeTelegramMarkdown(payload.vin_number || '-')}`,
    `Images: ${escapeTelegramMarkdown(String(payload.images_count ?? 0))}`,
    `Time: ${escapeTelegramMarkdown(formatEgyptDateTime(new Date()))}`,
    ...(waLink ? [`[💬 راسل العميل على واتساب](${waLink})`] : []),
  ].join('\n');
}

async function notifyWorkshopAnalysis(payload, env, log = console) {
  try {
    await sendTelegramMessage(formatWorkshopAnalysisMessage(payload), env);
  } catch (error) {
    log.error('❌ Telegram analysis notification error:', error.message);
  }
}

export function notifyWorkshopAnalysisAsync(payload, env, log = console) {
  setImmediate(() => {
    notifyWorkshopAnalysis(payload, env, log);
  });
}

function formatConsumerBookingMessage(payload) {
  const vehicle = [payload.vehicle_year, payload.vehicle_make, payload.vehicle_model].filter(Boolean).join(' ') || '-';
  const workshop = escapeTelegramMarkdown(payload.workshop_name || payload.workshop_id || '-');
  const branch   = payload.branch_name ? escapeTelegramMarkdown(payload.branch_name) : null;
  const waLink   = customerWaLink(payload.customer_mobile, BOOKING_WA_MESSAGE);
  const wsLink   = workshopWaLink(payload);
  return [
    '📥 *New Consumer Booking*',
    `Workshop: ${workshop}${branch ? ` › ${branch}` : ''}`,
    `Mobile: ${escapeTelegramMarkdown(payload.customer_mobile || '-')}`,
    `Vehicle: ${escapeTelegramMarkdown(vehicle)}`,
    ...(payload.scheduled_date ? [`📅 Booking date: ${escapeTelegramMarkdown(formatScheduledDate(payload.scheduled_date))}`] : []),
    `Images: ${escapeTelegramMarkdown(String(payload.images_count ?? 0))}`,
    `Time: ${escapeTelegramMarkdown(formatEgyptDateTime(new Date()))}`,
    ...(waLink ? [`[💬 راسل العميل على واتساب](${waLink})`] : []),
    ...(wsLink ? [`[🏢 ابعت للمركز على واتساب](${wsLink})`] : []),
  ].join('\n');
}

async function notifyConsumerBooking(payload, env, log = console) {
  try {
    await sendTelegramMessage(formatConsumerBookingMessage(payload), env);
  } catch (error) {
    log.error('❌ Telegram booking notification error:', error.message);
  }
}

export function notifyConsumerBookingAsync(payload, env, log = console) {
  setImmediate(() => {
    notifyConsumerBooking(payload, env, log);
  });
}

// ── Broker triggers ───────────────────────────────────────────────────────────

function formatBrokerFnolMessage(payload) {
  const vehicle = [payload.vehicle_year, payload.vehicle_make, payload.vehicle_model].filter(Boolean).join(' ') || '-';
  const waLink  = customerWaLink(payload.customer_mobile, BOOKING_WA_MESSAGE);
  return [
    '📋 *New FNOL Report*',
    `Broker: ${escapeTelegramMarkdown(payload.broker_name || payload.broker_id || '-')}`,
    `VIN: ${escapeTelegramMarkdown(payload.vin || '-')}`,
    `Customer: ${escapeTelegramMarkdown(payload.customer_mobile || '-')}`,
    `Vehicle: ${escapeTelegramMarkdown(vehicle)}`,
    `Location: ${escapeTelegramMarkdown(payload.location || '-')}`,
    `General images: ${escapeTelegramMarkdown(String(payload.general_images_count ?? 0))}`,
    `Damage images: ${escapeTelegramMarkdown(String(payload.damage_images_count ?? 0))}`,
    `Docs: ${escapeTelegramMarkdown(String(payload.docs_count ?? 0))}`,
    `Time: ${escapeTelegramMarkdown(formatEgyptDateTime(new Date()))}`,
    ...(waLink ? [`[💬 WhatsApp العميل](${waLink})`] : []),
  ].join('\n');
}

function formatBrokerBookingMessage(payload) {
  const vehicle = [payload.vehicle_year, payload.vehicle_make, payload.vehicle_model].filter(Boolean).join(' ') || '-';
  const wsLink  = workshopWaLink(payload);
  return [
    '🏢 *Workshop Booked — Broker Case*',
    `Broker: ${escapeTelegramMarkdown(payload.broker_name || '-')}`,
    `VIN: ${escapeTelegramMarkdown(payload.vin || '-')}`,
    `Workshop: ${escapeTelegramMarkdown(payload.workshop_name || '-')}${payload.branch_name ? ` › ${escapeTelegramMarkdown(payload.branch_name)}` : ''}`,
    `Customer: ${escapeTelegramMarkdown(payload.customer_mobile || '-')}`,
    `Vehicle: ${escapeTelegramMarkdown(vehicle)}`,
    ...(payload.scheduled_date ? [`📅 Date: ${escapeTelegramMarkdown(formatScheduledDate(payload.scheduled_date))}`] : []),
    `Time: ${escapeTelegramMarkdown(formatEgyptDateTime(new Date()))}`,
    ...(wsLink ? [`[🏢 WhatsApp المركز](${wsLink})`] : []),
  ].join('\n');
}

function formatBrokerAssessmentMessage(payload) {
  const vehicle = [payload.vehicle_year, payload.vehicle_make, payload.vehicle_model].filter(Boolean).join(' ') || '-';
  return [
    '✅ *Assessment Confirmed — Broker Case*',
    `Broker: ${escapeTelegramMarkdown(payload.broker_name || '-')}`,
    `VIN: ${escapeTelegramMarkdown(payload.vin || '-')}`,
    `Workshop: ${escapeTelegramMarkdown(payload.workshop_name || '-')}`,
    `Vehicle: ${escapeTelegramMarkdown(vehicle)}`,
    `Estimate: ${escapeTelegramMarkdown(payload.estimate ? `${Number(payload.estimate).toLocaleString()} EGP` : '-')}`,
    ...(payload.notes ? [`Notes: ${escapeTelegramMarkdown(payload.notes)}`] : []),
    `Time: ${escapeTelegramMarkdown(formatEgyptDateTime(new Date()))}`,
  ].join('\n');
}

async function notifyBrokerFnol(payload, env, log = console) {
  try { await sendTelegramMessage(formatBrokerFnolMessage(payload), env); }
  catch (err) { log.error('❌ Broker FNOL telegram error:', err.message); }
}
async function notifyBrokerBooking(payload, env, log = console) {
  try { await sendTelegramMessage(formatBrokerBookingMessage(payload), env); }
  catch (err) { log.error('❌ Broker booking telegram error:', err.message); }
}
async function notifyBrokerAssessment(payload, env, log = console) {
  try { await sendTelegramMessage(formatBrokerAssessmentMessage(payload), env); }
  catch (err) { log.error('❌ Broker assessment telegram error:', err.message); }
}

export function notifyBrokerFnolAsync(payload, env, log = console) {
  setImmediate(() => notifyBrokerFnol(payload, env, log));
}
export function notifyBrokerBookingAsync(payload, env, log = console) {
  setImmediate(() => notifyBrokerBooking(payload, env, log));
}
export function notifyBrokerAssessmentAsync(payload, env, log = console) {
  setImmediate(() => notifyBrokerAssessment(payload, env, log));
}

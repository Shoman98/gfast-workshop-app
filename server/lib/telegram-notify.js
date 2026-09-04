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
  return [
    '🔍 *New Vehicle Analysis Started*',
    `Workshop: ${escapeTelegramMarkdown(payload.workshop_name || payload.workshop_id || '-')}`,
    `Customer: ${escapeTelegramMarkdown(payload.customer_name || '-')}`,
    `Mobile: ${escapeTelegramMarkdown(payload.customer_mobile || '-')}`,
    `Vehicle: ${escapeTelegramMarkdown(vehicle)}`,
    `VIN: ${escapeTelegramMarkdown(payload.vin_number || '-')}`,
    `Images: ${escapeTelegramMarkdown(String(payload.images_count ?? 0))}`,
    `Time: ${escapeTelegramMarkdown(formatEgyptDateTime(new Date()))}`,
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
  return [
    '📥 *New Consumer Booking*',
    `Workshop: ${workshop}${branch ? ` › ${branch}` : ''}`,
    `Mobile: ${escapeTelegramMarkdown(payload.customer_mobile || '-')}`,
    `Vehicle: ${escapeTelegramMarkdown(vehicle)}`,
    ...(payload.scheduled_date ? [`📅 Booking date: ${escapeTelegramMarkdown(payload.scheduled_date)}`] : []),
    `Images: ${escapeTelegramMarkdown(String(payload.images_count ?? 0))}`,
    `Time: ${escapeTelegramMarkdown(formatEgyptDateTime(new Date()))}`,
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

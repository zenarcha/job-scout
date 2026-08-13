// Telegram delivery. One message per qualifying job (D-58).
// No-ops gracefully when TELEGRAM_* env is not configured.
import pRetry from 'p-retry';
import { env } from './config.js';
import { truncate } from './text.js';

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Telegram inline keyboard. Kept as a loose shape rather than importing a Bot API
// type — this is the only place it is constructed.
export interface InlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

export async function sendTelegram(html: string, replyMarkup?: InlineKeyboard): Promise<boolean> {
  if (!env.telegram.enabled()) return false;
  const url = `https://api.telegram.org/bot${env.telegram.botToken()}/sendMessage`;
  await pRetry(
    async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.telegram.chatId(),
          text: html,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      });
      if (!res.ok) throw new Error(`telegram ${res.status}: ${await res.text()}`);
    },
    { retries: 3, minTimeout: 1000 },
  );
  return true;
}

// D-77: 👍/👎 on the fields whose correctness is genuinely uncertain. Only attached
// when geo eligibility was ASSUMED — an explicitly-stated one needs no correction
// affordance, and a button on every message trains her to ignore them.
//
// `callback_data` is capped at 64 bytes by Telegram, so it carries the ids only;
// everything else is looked up when the tap is processed.
export function feedbackKeyboard(row: any): InlineKeyboard | undefined {
  if (row.geo_explicit !== false) return undefined;
  const enrichmentId = row.classify_enrichment_id;
  if (!enrichmentId) return undefined;
  return {
    inline_keyboard: [[
      { text: '👍 Remote-India correct', callback_data: `fb:1:${enrichmentId}` },
      { text: '👎 Wrong', callback_data: `fb:0:${enrichmentId}` },
    ]],
  };
}

const PRIO_EMOJI: Record<string, string> = { high: '🔴', med: '🟡', low: '⚪️' };

// D-73: the chip distinguishes "the posting says India-eligible" from "the posting
// said nothing and we assumed". Collapsing those into one confident label is exactly
// what made the uncertainty invisible.
function remoteChip(row: any): string | null {
  if (row.remote_type !== 'remote_india') return null;
  if (row.geo_explicit === true) return 'Remote-India';
  const verdict = row.geo_verdict ? `, AI-checked: ${row.geo_verdict}` : '';
  return `Remote-India (assumed${verdict})`;
}

// One job → an HTML block.
export function formatJob(row: any): string {
  const chips: string[] = [];
  if (row.is_ai === 'ai') chips.push('AI');

  const remote = remoteChip(row);
  if (remote) chips.push(remote);

  if (row.is_technical === 'technical') chips.push(`Tech L${row.technical_depth ?? '?'}`);
  if (row.business_model) chips.push(String(row.business_model).toUpperCase());
  if (row.institute_requirement === 'iit_iim_required') chips.push('IIT/IIM req');
  if (row.domain) chips.push(String(row.domain));
  if (Array.isArray(row.recommend_reasons)) chips.push(...row.recommend_reasons.map(String));

  const salary =
    row.salary_status === 'stated'
      ? ` · 💰 ${row.salary_currency ?? ''} ${row.salary_min ?? ''}${row.salary_max && row.salary_max !== row.salary_min ? '–' + row.salary_max : ''} ${row.salary_period ?? ''}`.trim()
      : '';

  const chipLine = [...new Set(chips)].map(esc).join(' · ');

  // D-41: both links, when both exist — the posting is what gets shared with a
  // referrer, the apply URL is where she actually applies. A single field could
  // only ever hold one.
  const links: string[] = [];
  if (row.apply_url) links.push(`<a href="${esc(row.apply_url)}">Apply →</a>`);
  if (row.posting_url) links.push(`<a href="${esc(row.posting_url)}">Posting →</a>`);
  const linkLine = links.length ? `\n${links.join(' · ')}` : '';

  const summary = row.jd_clean ? `\n${esc(truncate(row.jd_clean, 280))}` : '';

  return (
    `${PRIO_EMOJI[row.priority] ?? ''} <b>${esc(row.role_title ?? 'Role')}</b> — ${esc(row.company ?? '')}${salary}` +
    (chipLine ? `\n<i>${chipLine}</i>` : '') +
    linkLine +
    summary
  );
}

// Telegram delivery. Sends instant pings for High-priority matches and a batched digest
// for the rest. No-ops gracefully when TELEGRAM_* env is not configured.
import pRetry from 'p-retry';
import { env } from './config.js';
import { truncate } from './text.js';

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendTelegram(html: string): Promise<boolean> {
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
        }),
      });
      if (!res.ok) throw new Error(`telegram ${res.status}: ${await res.text()}`);
    },
    { retries: 3, minTimeout: 1000 },
  );
  return true;
}

const PRIO_EMOJI: Record<string, string> = { high: '🔴', med: '🟡', low: '⚪️' };

// One job → an HTML block (used for both instant pings and digest lines).
export function formatJob(row: any): string {
  const chips: string[] = [];
  if (row.is_ai === 'ai') chips.push('AI');
  if (row.remote_type === 'remote_india') chips.push('Remote-India');
  if (row.is_technical === 'technical') chips.push(`Tech L${row.technical_depth ?? '?'}`);
  if (row.business_model) chips.push(String(row.business_model).toUpperCase());
  if (row.institute_requirement === 'iit_iim_required') chips.push('IIT/IIM req');
  if (row.resume_match_score != null) chips.push(`${row.resume_match_score}% match`);
  if (Array.isArray(row.recommend_reasons)) chips.push(...row.recommend_reasons.map(String));

  const salary =
    row.salary_status === 'stated'
      ? ` · 💰 ${row.salary_currency ?? ''} ${row.salary_min ?? ''}${row.salary_max && row.salary_max !== row.salary_min ? '–' + row.salary_max : ''} ${row.salary_period ?? ''}`.trim()
      : '';

  const chipLine = [...new Set(chips)].map(esc).join(' · ');
  const applyLine = row.apply_url ? `\n<a href="${esc(row.apply_url)}">Apply →</a>` : '';
  const summary = row.jd_clean ? `\n${esc(truncate(row.jd_clean, 280))}` : '';

  return (
    `${PRIO_EMOJI[row.priority] ?? ''} <b>${esc(row.role_title ?? 'Role')}</b> — ${esc(row.company ?? '')}${salary}` +
    (chipLine ? `\n<i>${chipLine}</i>` : '') +
    applyLine +
    summary
  );
}

// Feedback capture (D-77) — reads 👍/👎 taps back out of Telegram and stores them
// in `job_feedback`.
//
// Uses Telegram's getUpdates POLLING rather than a push webhook. This project runs
// entirely as periodic scripts; there is no deployed HTTP endpoint anywhere (even
// the Apify ingest handler is written to be mounted "in Phase 7" and isn't mounted
// today). Standing up this project's first live server just to receive two buttons
// would be real new infrastructure; polling is the same shape as every other stage.
//
// Per D-69 storage is PER-FIELD, because feedback doubles as the classify
// validation instrument — "this job was wrong" can't tell you *which* tag failed.
import { db } from './db.js';
import { env } from './config.js';
import { emitEvent } from './events.js';

const OFFSET_KEY = 'telegram_update_offset';

// callback_data is `fb:<1|0>:<enrichment_id>` — Telegram caps it at 64 bytes, so it
// carries ids only. The field is implied: today the only button is on the assumed-geo
// marker, which corrects `remote_type`.
const CALLBACK = /^fb:([01]):([0-9a-f-]{36})$/i;
const FIELD = 'remote_type';

async function readOffset(): Promise<number> {
  const { data } = await db().from('app_config').select('value').eq('key', OFFSET_KEY).maybeSingle();
  const v = Number(data?.value ?? 0);
  return Number.isFinite(v) ? v : 0;
}

async function writeOffset(offset: number): Promise<void> {
  await db()
    .from('app_config')
    .upsert({ key: OFFSET_KEY, value: offset, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

async function telegram(method: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`telegram ${method} ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function pollFeedback(): Promise<{ stored: number; seen: number }> {
  if (!env.telegram.enabled()) return { stored: 0, seen: 0 };

  const offset = await readOffset();
  const updates: any[] = (await telegram('getUpdates', { offset, timeout: 0 }))?.result ?? [];

  let stored = 0;
  let maxUpdateId = offset - 1;

  for (const update of updates) {
    maxUpdateId = Math.max(maxUpdateId, Number(update.update_id ?? 0));

    const cb = update.callback_query;
    if (!cb?.data) continue;
    const match = CALLBACK.exec(String(cb.data));
    if (!match) continue;

    const verdict = match[1] === '1';
    const enrichmentId = match[2]!;

    // A thumbs-down carries no corrected_value here — the button can't express one.
    // That still counts for D-71's accuracy measurement, it just doesn't LOCK the
    // field (writeEnrichment only treats a correction WITH a value as a lock).
    const { error } = await db().from('job_feedback').insert({
      enrichment_id: enrichmentId,
      field: FIELD,
      verdict,
      corrected_value: null,
    });

    if (!error) {
      stored++;
      await emitEvent({
        jobId: null,
        type: 'FeedbackReceived',
        stage: 'feedback',
        payload: { enrichmentId, field: FIELD, verdict },
      });
    }

    // Clears the spinner on her phone and confirms the tap landed.
    await telegram('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: verdict ? 'Thanks — marked correct' : 'Thanks — marked wrong',
    });
  }

  // Advance past everything consumed, so a re-run doesn't double-insert.
  if (updates.length > 0) await writeOffset(maxUpdateId + 1);

  return { stored, seen: updates.length };
}

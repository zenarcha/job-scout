// Notification Service. High-priority matches ping Telegram instantly; Med/Low go in a
// periodic digest. Every notified job is also upserted to Notion. Idempotent: a job is
// notified once, guarded by a NotificationSent event (no notified_at column needed).
import { db } from '../../lib/db.js';
import { emitEvent } from '../../lib/events.js';
import { formatJob, sendTelegram } from '../../lib/telegram.js';
import { upsertJobPage } from '../../lib/notion.js';
import type { Priority } from '../../lib/types.js';

async function notifiedIds(): Promise<Set<string>> {
  const { data } = await db().from('job_events').select('job_id').eq('type', 'NotificationSent');
  return new Set((data ?? []).map((r) => r.job_id as string).filter(Boolean));
}

// Canonical, fully-recommended jobs of the given priorities that haven't been notified.
async function candidates(priorities: Priority[]): Promise<any[]> {
  const done = await notifiedIds();
  const { data } = await db()
    .from('v_jobs_enriched')
    .select('*')
    .in('priority', priorities)
    .is('canonical_job_id', null);
  return (data ?? []).filter((r) => !done.has(r.id as string));
}

// Deliver one job to Telegram (optional) + Notion, then mark it notified.
async function deliver(row: any, viaTelegram: boolean): Promise<void> {
  try {
    if (viaTelegram) await sendTelegram(formatJob(row));
    await upsertJobPage(row);
    await emitEvent({
      jobId: row.id,
      type: 'NotificationSent',
      stage: 'notify',
      payload: { priority: row.priority },
    });
  } catch (err: any) {
    await emitEvent({ jobId: row.id, type: 'StageFailed', stage: 'notify', error: String(err?.message ?? err) });
  }
}

// Instant path: High-priority new matches.
export async function notifyNew(): Promise<{ sent: number }> {
  const rows = await candidates(['high']);
  for (const row of rows) await deliver(row, true);
  return { sent: rows.length };
}

// Digest path: Med/Low matches bundled into a single Telegram message.
export async function sendDigest(): Promise<{ sent: number }> {
  const rows = await candidates(['med', 'low']);
  if (rows.length === 0) return { sent: 0 };

  const header = `🗞️ <b>${rows.length} new job${rows.length > 1 ? 's' : ''}</b> (med/low priority)\n`;
  await sendTelegram(header + rows.map(formatJob).join('\n\n'));

  // Notion upsert + mark notified (Telegram already sent in the batch above).
  for (const row of rows) await deliver(row, false);
  return { sent: rows.length };
}

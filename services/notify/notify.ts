// Notification Service — one Telegram message per qualifying job.
//
// D-58 removed the instant/digest split: it solved a volume problem that doesn't
// exist at 1-2 relevant jobs/day, and two delivery paths meant two things to keep
// in sync. D-59 removed the Notion upsert entirely.
//
// Two gates decide what reaches her:
//   • priority ∈ {high, med} — `low` is computed and stored but never sent (D-65)
//   • remote_type = 'remote_india' — D-76. Everything else is suppressed. Note this
//     does NOT gate on the geo recheck's verdict: a job the recheck flags
//     'ineligible' is still delivered, just marked. A false positive costs 30
//     seconds of reading; a false negative costs a role she'd never know existed.
//
// Idempotent: a job is notified once, guarded by a NotificationSent event (D-16).
import { db } from '../../lib/db.js';
import { emitEvent } from '../../lib/events.js';
import { feedbackKeyboard, formatJob, sendTelegram } from '../../lib/telegram.js';

async function notifiedIds(): Promise<Set<string>> {
  const { data } = await db().from('job_events').select('job_id').eq('type', 'NotificationSent');
  return new Set((data ?? []).map((r) => r.job_id as string).filter(Boolean));
}

// Canonical, fully-recommended, India-eligible jobs that haven't been notified.
async function candidates(): Promise<any[]> {
  const done = await notifiedIds();
  const { data } = await db()
    .from('v_jobs_enriched')
    .select('*')
    .in('priority', ['high', 'med'])
    .eq('remote_type', 'remote_india')
    .is('canonical_job_id', null);
  return (data ?? []).filter((r) => !done.has(r.id as string));
}

export async function notifyNew(): Promise<{ sent: number }> {
  const rows = await candidates();
  let sent = 0;

  for (const row of rows) {
    try {
      // Assumed-eligible jobs carry 👍/👎 so the "(assumed)" marker can be
      // corrected (D-77). Explicitly-eligible ones need no correction affordance.
      // `sendTelegram` returns false (it does NOT throw) when Telegram is unconfigured.
      // Ignoring that return value wrote a NotificationSent event for a message that was
      // never sent — and since that event is the permanent idempotency guard (D-16), the
      // job could never be delivered later. Found on the first real run, 2026-08-07: two
      // jobs were burned this way with no token set. This is D-99's mistake in the notify
      // path — inferring success instead of recording the outcome — so the guard is only
      // written when delivery actually happened.
      const delivered = await sendTelegram(formatJob(row), feedbackKeyboard(row));
      if (!delivered) continue; // stays a candidate; retried once Telegram is configured
      await emitEvent({
        jobId: row.id,
        type: 'NotificationSent',
        stage: 'notify',
        payload: { priority: row.priority, geoExplicit: row.geo_explicit },
      });
      sent++;
    } catch (err: any) {
      await emitEvent({
        jobId: row.id,
        type: 'StageFailed',
        stage: 'notify',
        error: String(err?.message ?? err),
      });
    }
  }

  return { sent };
}

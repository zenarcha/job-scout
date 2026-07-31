// Notion tracker sync. Upserts one page per job (keyed by the "Job ID" property).
// No-ops gracefully when NOTION_* env is not configured. See docs/NOTION_SETUP.md for the
// required database property schema.
import pRetry, { AbortError } from 'p-retry';
import { env } from './config.js';
import { truncate } from './text.js';

const NOTION_VERSION = '2022-06-28';

async function notion(path: string, body: unknown, method = 'POST'): Promise<any> {
  return pRetry(
    async () => {
      const res = await fetch(`https://api.notion.com/v1/${path}`, {
        method,
        headers: {
          authorization: `Bearer ${env.notion.token()}`,
          'content-type': 'application/json',
          'Notion-Version': NOTION_VERSION,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const t = await res.text();
        if (res.status >= 500 || res.status === 429) throw new Error(`notion ${res.status}: ${t}`);
        throw new AbortError(`notion ${res.status}: ${t}`);
      }
      return res.json();
    },
    { retries: 3, minTimeout: 1000 },
  );
}

const richText = (s: string | null | undefined) => (s ? [{ text: { content: truncate(String(s), 1900) } }] : []);
const select = (s: string | null | undefined) => (s ? { name: String(s).slice(0, 100) } : null);

function propsFor(row: any): Record<string, unknown> {
  const salary =
    row.salary_status === 'stated'
      ? `${row.salary_currency ?? ''} ${row.salary_min ?? ''}${row.salary_max && row.salary_max !== row.salary_min ? '-' + row.salary_max : ''} ${row.salary_period ?? ''}`.trim()
      : '';
  return {
    Name: { title: [{ text: { content: truncate(row.role_title ?? 'Role', 190) } }] },
    Company: { rich_text: richText(row.company) },
    'Job ID': { rich_text: richText(row.id) },
    Status: { select: select(row.status ?? 'new') },
    Priority: { select: select(row.priority) },
    Match: { number: row.resume_match_score ?? null },
    Remote: { select: select(row.remote_type) },
    Technical: { select: select(row.is_technical) },
    AI: { select: select(row.is_ai) },
    'Business Model': { select: select(row.business_model) },
    Institute: { select: select(row.institute_requirement) },
    Salary: { rich_text: richText(salary) },
    Source: { select: select(row.source) },
    Skills: { multi_select: (row.skills ?? []).slice(0, 20).map((s: string) => ({ name: String(s).slice(0, 100) })) },
    ...(row.apply_url ? { 'Apply URL': { url: row.apply_url } } : {}),
  };
}

export async function upsertJobPage(row: any): Promise<boolean> {
  if (!env.notion.enabled()) return false;
  const dbId = env.notion.databaseId();

  const found = await notion(`databases/${dbId}/query`, {
    filter: { property: 'Job ID', rich_text: { equals: String(row.id) } },
    page_size: 1,
  });

  const properties = propsFor(row);
  const existing = found?.results?.[0];
  if (existing) {
    await notion(`pages/${existing.id}`, { properties }, 'PATCH');
  } else {
    await notion('pages', { parent: { database_id: dbId }, properties });
  }
  return true;
}

// Centralized, validated environment config. Import `env` anywhere server-side.
import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function opt(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export type ProviderName = 'gemini' | 'cerebras' | 'grok' | 'groq';

export const env = {
  supabase: {
    url: () => req('SUPABASE_URL'),
    serviceRoleKey: () => req('SUPABASE_SERVICE_ROLE_KEY'),
    anonKey: () => opt('SUPABASE_ANON_KEY'),
  },
  ai: {
    defaultProvider: (opt('AI_PROVIDER', 'gemini') as ProviderName),
    // Fallback must match D-97's pinned model. It previously read
    // 'gemini-2.5-flash' — the model Google retired mid-project — so an unset
    // GEMINI_MODEL would silently reinstate the exact outage D-97 was logged for.
    // `apiKey()` is kept for callers that want a single key, but the Gemini adapter
    // draws from lib/ai/keyPool.ts instead — the free-tier cap is per *project*, so
    // several keys from several projects are what actually raise the ceiling (D-118).
    // Either GEMINI_API_KEY or GEMINI_API_KEYS may hold a comma-separated list.
    gemini: { apiKey: () => req('GEMINI_API_KEY'), model: opt('GEMINI_MODEL', 'gemini-3.6-flash') },
    cerebras: { apiKey: () => req('CEREBRAS_API_KEY'), model: opt('CEREBRAS_MODEL', 'llama-3.3-70b') },
    grok: { apiKey: () => req('GROK_API_KEY'), model: opt('GROK_MODEL', 'grok-2-latest') },
    // D-124. NOTE `groq` (free, api.groq.com) is a DIFFERENT VENDOR from `grok`
    // above (xAI, paid) — one letter apart, and D-113 already conflated them once.
    // Model sets the daily ceiling: llama-3.3-70b-versatile = 1,000/day,
    // llama-3.1-8b-instant = 14,400/day but a weaker instruction-follower.
    groq: { apiKey: () => req('GROQ_API_KEY'), model: opt('GROQ_MODEL', 'llama-3.3-70b-versatile') },
    // D-107: minimum gap between consecutive AI calls, and how long to wait after a
    // 429 before retrying. Both are env-tunable because the real RPM/TPM ceiling is not
    // published — Google's docs say to read it off AI Studio per-account — so these are
    // starting values to be tuned against observed behaviour, not known-correct limits.
    // Set AI_CALL_SPACING_MS=0 to disable spacing entirely (e.g. in tests).
    callSpacingMs: () => Number(opt('AI_CALL_SPACING_MS', '4000')),
    rateLimitBackoffMs: () => Number(opt('AI_RATE_LIMIT_BACKOFF_MS', '65000')),
    // Per-stage provider overrides (empty => use defaultProvider).
    // `recommend` is absent: D-53 made it a deterministic rule in code, not an AI call.
    // `geo_recheck` is configurable so D-70's open idea — run the recheck on a
    // *different* provider and treat disagreement as an uncertainty signal — stays
    // available without deciding it here.
    stageProvider: {
      classify: opt('AI_PROVIDER_CLASSIFY') as ProviderName | '',
      geo_recheck: opt('AI_PROVIDER_GEO_RECHECK') as ProviderName | '',
      skills: opt('AI_PROVIDER_SKILLS') as ProviderName | '',
      // D-136: senior-titled jobs' standalone remote-only check.
      remote_check: opt('AI_PROVIDER_REMOTE_CHECK') as ProviderName | '',
    } as Record<string, ProviderName | ''>,
  },
  apify: {
    token: () => req('APIFY_TOKEN'),
    webhookSecret: () => opt('APIFY_WEBHOOK_SECRET'),
  },
  telegram: {
    botToken: () => opt('TELEGRAM_BOT_TOKEN'),
    chatId: () => opt('TELEGRAM_CHAT_ID'),
    enabled: () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  },
  notion: {
    token: () => opt('NOTION_TOKEN'),
    databaseId: () => opt('NOTION_DATABASE_ID'),
    enabled: () => Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID),
  },
  remoteIndiaKeywords: opt('REMOTE_INDIA_KEYWORDS', 'india,remote india,anywhere,worldwide,global,asia')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  ingest: {
    // D-104: defaults to **off**. The regex pre-filter was wrong on half its real drops, and
    // Sakshi's decision was that the AI owns this judgement, not a keyword scan — so nothing
    // is dropped at ingest and `classify.remote_type` is the verdict (with `geo_recheck` as
    // D-75's second pass on assumed-eligible cases). The flag survives because D-72's
    // store-then-filter-at-read design is what made the 50% error rate measurable at all;
    // set INGEST_REMOTE_FILTER=on to re-enable the cheap location-tag check if AI volume
    // ever needs cutting.
    remoteFilter: () => opt('INGEST_REMOTE_FILTER', 'off').toLowerCase() === 'on',
  },
};

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

export type ProviderName = 'gemini' | 'cerebras' | 'grok';

export const env = {
  supabase: {
    url: () => req('SUPABASE_URL'),
    serviceRoleKey: () => req('SUPABASE_SERVICE_ROLE_KEY'),
    anonKey: () => opt('SUPABASE_ANON_KEY'),
  },
  ai: {
    defaultProvider: (opt('AI_PROVIDER', 'gemini') as ProviderName),
    gemini: { apiKey: () => req('GEMINI_API_KEY'), model: opt('GEMINI_MODEL', 'gemini-2.5-flash') },
    cerebras: { apiKey: () => req('CEREBRAS_API_KEY'), model: opt('CEREBRAS_MODEL', 'llama-3.3-70b') },
    grok: { apiKey: () => req('GROK_API_KEY'), model: opt('GROK_MODEL', 'grok-2-latest') },
    // Per-stage provider overrides (empty => use defaultProvider).
    stageProvider: {
      classify: opt('AI_PROVIDER_CLASSIFY') as ProviderName | '',
      resume_match: opt('AI_PROVIDER_RESUME_MATCH') as ProviderName | '',
      skills: opt('AI_PROVIDER_SKILLS') as ProviderName | '',
      recommend: opt('AI_PROVIDER_RECOMMEND') as ProviderName | '',
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
    // Configurable pre-filter (evolvability): 'on' (default) drops obviously on-site roles at ingest;
    // 'off' keeps everything (store-then-filter-at-read) so a future strategy change needs no re-scrape.
    remoteFilter: () => opt('INGEST_REMOTE_FILTER', 'on').toLowerCase() !== 'off',
  },
};

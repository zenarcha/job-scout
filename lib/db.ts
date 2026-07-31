// Server-side Supabase client (service-role — bypasses RLS). NEVER import in browser code.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './config.js';

let _client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!_client) {
    _client = createClient(env.supabase.url(), env.supabase.serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const getSupabaseCredentials = () => {
  const url = envUrl || localStorage.getItem('kirana_supabase_url') || '';
  const key = envKey || localStorage.getItem('kirana_supabase_key') || '';
  return { url, key };
};

const { url: defaultUrl, key: defaultKey } = getSupabaseCredentials();

export const isSupabaseConfigured = Boolean(defaultUrl && defaultKey);

export const supabase = isSupabaseConfigured
  ? createClient(defaultUrl, defaultKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

export const createCustomSupabaseClient = (url: string, key: string) => {
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
};


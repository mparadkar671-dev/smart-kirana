import { createClient } from '@supabase/supabase-js';

export const normalizeSupabaseUrl = (rawUrl: string): string => {
  if (!rawUrl) return '';
  let cleaned = rawUrl.trim().replace(/^['"]+|['"]+$/g, '');
  if (!cleaned) return '';
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }
  return cleaned.replace(/\/+$/, '');
};

export const normalizeSupabaseKey = (rawKey: string): string => {
  if (!rawKey) return '';
  return rawKey.trim().replace(/^['"]+|['"]+$/g, '');
};

const rawEnvUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '';
const rawEnvKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export const getSupabaseCredentials = () => {
  const url = normalizeSupabaseUrl(
    localStorage.getItem('kirana_supabase_url') || rawEnvUrl || ''
  );
  const key = normalizeSupabaseKey(
    localStorage.getItem('kirana_supabase_key') || rawEnvKey || ''
  );
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
  const validUrl = normalizeSupabaseUrl(url);
  const validKey = normalizeSupabaseKey(key);
  if (!validUrl || !validKey) return null;
  return createClient(validUrl, validKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
};

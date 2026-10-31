import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const HARDCODED_DEFAULT_URL = 'https://oyolyrptcfbudnwlxyyq.supabase.co';
export const HARDCODED_DEFAULT_KEY = 'sb_publishable_4X9qyDAe9zW4Y6XcsXLubw_pSJmfCs2';

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

const rawEnvUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.NEXT_PUBLIC_SUPABASE_URL) ||
  '';
const rawEnvKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  '';

export const getSupabaseCredentials = () => {
  let storedUrl = '';
  let storedKey = '';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      storedUrl = localStorage.getItem('kirana_supabase_url') || '';
      storedKey = localStorage.getItem('kirana_supabase_key') || '';
    }
  } catch {
    // Ignore storage restriction errors
  }

  const url = normalizeSupabaseUrl(storedUrl || rawEnvUrl || HARDCODED_DEFAULT_URL);
  const key = normalizeSupabaseKey(storedKey || rawEnvKey || HARDCODED_DEFAULT_KEY);
  return { url, key };
};

let activeClient: SupabaseClient | null = null;
let lastUrl = '';
let lastKey = '';

export const getSupabaseClient = (): SupabaseClient => {
  const { url, key } = getSupabaseCredentials();
  if (activeClient && lastUrl === url && lastKey === key) {
    return activeClient;
  }
  activeClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  lastUrl = url;
  lastKey = key;
  return activeClient;
};

export const setSupabaseCredentials = (url: string, key: string): SupabaseClient => {
  const validUrl = normalizeSupabaseUrl(url);
  const validKey = normalizeSupabaseKey(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('kirana_supabase_url', validUrl);
      localStorage.setItem('kirana_supabase_key', validKey);
    }
  } catch {
    // Ignore storage restriction errors
  }
  const finalUrl = validUrl || HARDCODED_DEFAULT_URL;
  const finalKey = validKey || HARDCODED_DEFAULT_KEY;
  activeClient = createClient(finalUrl, finalKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  lastUrl = finalUrl;
  lastKey = finalKey;
  return activeClient;
};

export const isSupabaseConfigured = true;

// Dynamic proxy ensuring `supabase` is always available and backed by active client
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

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

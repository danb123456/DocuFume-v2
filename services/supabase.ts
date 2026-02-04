
import { createClient } from '@supabase/supabase-js';

/**
 * SUPABASE CONNECTION SETTINGS
 * URL: Found in Project Settings > API > Project URL
 * KEY: Found in Project Settings > API > `anon` `public` key
 */
const supabaseUrl = (process.env as any).SUPABASE_URL || 'https://tgkflsvcvdtmywkwrbre.supabase.co';
const supabaseAnonKey = (process.env as any).SUPABASE_ANON_KEY || 'sb_publishable_QAg3bVZS_73KMdIC34d3Bg_XlZG0qOG';

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder');

export const testConnection = async () => {
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    return { connected: false, error: 'Missing Credentials: URL or API Key is empty.' };
  }
  try {
    const { data, error } = await supabase.from('envelopes').select('id').limit(1);
    if (error) throw error;
    return { connected: true, error: null };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
};

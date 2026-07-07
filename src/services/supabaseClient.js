import { appConfig, isSupabaseConfigured } from "./config.js";

export const supabaseClient = isSupabaseConfigured()
  ? window.supabase.createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey)
  : null;

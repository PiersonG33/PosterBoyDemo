import { createClient } from '@supabase/supabase-js'

export interface SupabaseRuntimeConfig {
  url: string
  publishableKey: string
  boardSlug: string
}

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const publishableKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ?? import.meta.env.VITE_SUPABASE_ANON_KEY
  )?.trim()

  if (!url || !publishableKey) return null

  return {
    url,
    publishableKey,
    boardSlug: import.meta.env.VITE_POSTER_BOY_BOARD?.trim() || 'investor-demo',
  }
}

export function createSupabaseBrowserClient(config: SupabaseRuntimeConfig) {
  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
}

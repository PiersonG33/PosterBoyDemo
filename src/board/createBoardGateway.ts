import type { DemoSettings } from '../demoSettings'
import { createSupabaseBrowserClient, getSupabaseRuntimeConfig } from '../lib/supabase'
import type { BoardGateway } from './BoardGateway'
import { LocalBoardGateway } from './localBoardGateway'
import { SupabaseBoardGateway } from './supabaseBoardGateway'

export function createBoardGateway(settings: DemoSettings): BoardGateway {
  const config = getSupabaseRuntimeConfig()
  if (!config) return new LocalBoardGateway(settings)

  return new SupabaseBoardGateway(
    createSupabaseBrowserClient(config),
    config.boardSlug,
  )
}

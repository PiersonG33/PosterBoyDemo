// CUSTOM WORD BOMB — isolated Supabase lobby client and remote-state mapping.

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseBrowserClient, getSupabaseRuntimeConfig } from '../lib/supabase'

export type OnlineLobbyStatus = 'waiting' | 'playing' | 'finished'
export type OnlineConnectionStatus = 'connecting' | 'live' | 'offline'

export interface OnlinePlayer {
  id: string
  name: string
  seat: number
  lives: number
}

export interface OnlineLobbyEvent {
  type: string
  playerId: string | null
  word: string | null
}

export interface OnlineLobby {
  id: string
  code: string
  status: OnlineLobbyStatus
  startingLives: number
  currentPlayerId: string | null
  prompt: string | null
  deadlineMs: number | null
  usedWords: string[]
  round: number
  completedTurns: number
  winnerPlayerId: string | null
  revision: number
  isHost: boolean
  youPlayerId: string
  lastEvent: OnlineLobbyEvent
  lastExamples: string[]
  players: OnlinePlayer[]
}

interface RemoteRecord {
  [key: string]: unknown
}

function isRecord(value: unknown): value is RemoteRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(record: RemoteRecord, key: string, nullable = false): string | null {
  const value = record[key]
  if (nullable && value === null) return null
  if (typeof value !== 'string') throw new Error('The lobby returned invalid data.')
  return value
}

function readNumber(record: RemoteRecord, key: string): number {
  const value = Number(record[key])
  if (!Number.isFinite(value)) throw new Error('The lobby returned invalid data.')
  return value
}

export function mapOnlineLobby(value: unknown, receivedAt = Date.now()): OnlineLobby {
  if (!isRecord(value)) throw new Error('The lobby returned invalid data.')
  const playersValue = value.players
  const eventValue = value.lastEvent
  const status = readString(value, 'status')
  const serverTime = readString(value, 'serverTime')
  const deadlineAt = readString(value, 'deadlineAt', true)

  if (!['waiting', 'playing', 'finished'].includes(status ?? '')) {
    throw new Error('The lobby returned an invalid status.')
  }
  if (!Array.isArray(playersValue) || !isRecord(eventValue)) {
    throw new Error('The lobby returned invalid players.')
  }

  const players = playersValue.map((playerValue): OnlinePlayer => {
    if (!isRecord(playerValue)) throw new Error('The lobby returned an invalid player.')
    return {
      id: readString(playerValue, 'id')!,
      name: readString(playerValue, 'name')!,
      seat: readNumber(playerValue, 'seat'),
      lives: readNumber(playerValue, 'lives'),
    }
  })

  let deadlineMs: number | null = null
  if (deadlineAt) {
    const serverTimeMs = Date.parse(serverTime!)
    const serverDeadlineMs = Date.parse(deadlineAt)
    if (!Number.isFinite(serverTimeMs) || !Number.isFinite(serverDeadlineMs)) {
      throw new Error('The lobby returned an invalid deadline.')
    }
    deadlineMs = receivedAt + Math.max(0, serverDeadlineMs - serverTimeMs)
  }

  const usedWordsValue = value.usedWords
  const lastExamplesValue = value.lastExamples
  if (!Array.isArray(usedWordsValue) || usedWordsValue.some((word) => typeof word !== 'string')) {
    throw new Error('The lobby returned invalid used words.')
  }
  if (!Array.isArray(lastExamplesValue) || lastExamplesValue.some((word) => typeof word !== 'string')) {
    throw new Error('The lobby returned invalid examples.')
  }

  return {
    id: readString(value, 'id')!,
    code: readString(value, 'code')!,
    status: status as OnlineLobbyStatus,
    startingLives: readNumber(value, 'startingLives'),
    currentPlayerId: readString(value, 'currentPlayerId', true),
    prompt: readString(value, 'prompt', true),
    deadlineMs,
    usedWords: usedWordsValue as string[],
    round: readNumber(value, 'round'),
    completedTurns: readNumber(value, 'completedTurns'),
    winnerPlayerId: readString(value, 'winnerPlayerId', true),
    revision: readNumber(value, 'revision'),
    isHost: value.isHost === true,
    youPlayerId: readString(value, 'youPlayerId')!,
    lastEvent: {
      type: readString(eventValue, 'type')!,
      playerId: readString(eventValue, 'playerId', true),
      word: readString(eventValue, 'word', true),
    },
    lastExamples: lastExamplesValue as string[],
    players,
  }
}

function readableError(error: unknown): Error {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return new Error(error.message.replace(/^.*?: /, ''))
  }
  return new Error('The online lobby could not be reached.')
}

export class WordBombOnlineService {
  private readonly client: SupabaseClient
  private readyPromise: Promise<void> | null = null

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async createLobby(name: string, lives: number, words: string[], prompts: string[]): Promise<OnlineLobby> {
    await this.ensureReady()
    return this.call('word_bomb_create_lobby', {
      p_name: name,
      p_lives: lives,
      p_words: words,
      p_prompts: prompts,
    })
  }

  async joinLobby(code: string, name: string): Promise<OnlineLobby> {
    await this.ensureReady()
    return this.call('word_bomb_join_lobby', { p_code: code, p_name: name })
  }

  async getLobby(code: string): Promise<OnlineLobby> {
    await this.ensureReady()
    return this.call('word_bomb_get_lobby', { p_code: code })
  }

  async leaveLobby(code: string): Promise<void> {
    await this.ensureReady()
    const { error } = await this.client.rpc('word_bomb_leave_lobby', { p_code: code })
    if (error) throw readableError(error)
  }

  async startLobby(code: string): Promise<OnlineLobby> {
    return this.call('word_bomb_start_lobby', { p_code: code })
  }

  async submitWord(code: string, revision: number, word: string): Promise<OnlineLobby> {
    return this.call('word_bomb_submit_word', {
      p_code: code,
      p_revision: revision,
      p_word: word,
    })
  }

  async expireTurn(code: string, revision: number): Promise<OnlineLobby> {
    return this.call('word_bomb_expire_turn', { p_code: code, p_revision: revision })
  }

  async restartLobby(code: string): Promise<OnlineLobby> {
    return this.call('word_bomb_restart_lobby', { p_code: code })
  }

  subscribe(
    lobby: Pick<OnlineLobby, 'id' | 'code'>,
    onChange: (nextLobby: OnlineLobby) => void,
    onStatus: (status: OnlineConnectionStatus) => void,
  ): () => void {
    let active = true
    let channel: RealtimeChannel | null = null
    let refreshTimer: number | null = null
    onStatus('connecting')

    const refresh = () => {
      if (!active || refreshTimer !== null) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        void this.getLobby(lobby.code)
          .then((nextLobby) => {
            if (active) onChange(nextLobby)
          })
          .catch(() => {
            if (active) onStatus('offline')
          })
      }, 70)
    }

    channel = this.client
      .channel(`word-bomb:${lobby.id}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'word_bomb_lobbies', filter: `id=eq.${lobby.id}` },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'word_bomb_players', filter: `lobby_id=eq.${lobby.id}` },
        refresh,
      )
      .subscribe((status) => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          onStatus('live')
          refresh()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          onStatus('offline')
        } else {
          onStatus('connecting')
        }
      })

    const pollTimer = window.setInterval(refresh, 4_000)

    return () => {
      active = false
      window.clearInterval(pollTimer)
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      if (channel) void this.client.removeChannel(channel)
      channel = null
    }
  }

  private async call(functionName: string, args: Record<string, unknown>): Promise<OnlineLobby> {
    const { data, error } = await this.client.rpc(functionName, args)
    if (error) throw readableError(error)
    return mapOnlineLobby(data)
  }

  private ensureReady(): Promise<void> {
    if (this.readyPromise) return this.readyPromise
    const attempt = this.initialize()
    this.readyPromise = attempt
    void attempt.catch(() => {
      if (this.readyPromise === attempt) this.readyPromise = null
    })
    return attempt
  }

  private async initialize(): Promise<void> {
    const { data, error } = await this.client.auth.getSession()
    if (error) throw readableError(error)
    if (data.session) return

    const signInResult = await this.client.auth.signInAnonymously()
    if (signInResult.error) throw readableError(signInResult.error)
  }
}

export function createWordBombOnlineService(): WordBombOnlineService | null {
  const config = getSupabaseRuntimeConfig()
  return config ? new WordBombOnlineService(createSupabaseBrowserClient(config)) : null
}

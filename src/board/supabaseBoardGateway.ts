import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { NOTE_COLORS, REMOVED_NOTE_RETENTION_MS } from '../constants'
import type {
  ActionBudget,
  BoardNote,
  BoardSnapshot,
  DrawingData,
  NoteColor,
  NotePlacement,
  PinPosition,
} from '../types'
import {
  BoardActionError,
  type BoardConnectionStatus,
  type BoardGateway,
} from './BoardGateway'

interface NoteRow {
  id: string
  created_at: string
  content_type: 'text' | 'drawing'
  text_content: string | null
  drawing_data: unknown
  board_x: number
  board_y: number
  rotation: number
  color: string
  removed_at: string | null
}

interface PinRow {
  id: string
  created_at: string
  x: number
  y: number
}

const isNoteColor = (value: string): value is NoteColor => (
  NOTE_COLORS.includes(value as NoteColor)
)

export function mapRemoteNote(row: NoteRow): BoardNote {
  if (!isNoteColor(row.color)) throw new BoardActionError('The shared board returned an invalid note color.')

  const base = {
    id: row.id,
    createdAt: row.created_at,
    boardX: row.board_x,
    boardY: row.board_y,
    rotation: row.rotation,
    color: row.color,
    removedAt: row.removed_at,
  }

  if (row.content_type === 'text' && typeof row.text_content === 'string') {
    return {
      ...base,
      contentType: 'text',
      textContent: row.text_content,
      drawingData: null,
    }
  }

  if (row.content_type === 'drawing' && row.drawing_data) {
    return {
      ...base,
      contentType: 'drawing',
      textContent: null,
      drawingData: row.drawing_data as DrawingData,
    }
  }

  throw new BoardActionError('The shared board returned an invalid note.')
}

export function parseRemoteBudget(value: unknown): ActionBudget {
  if (!value || typeof value !== 'object') {
    throw new BoardActionError('The shared board returned an invalid action budget.')
  }

  const record = value as Record<string, unknown>
  const limit = Number(record.limit)
  const used = Number(record.used)
  const windowStartedAt = record.windowStartedAt
  const windowEndsAt = record.windowEndsAt
  if (
    !Number.isFinite(limit) || !Number.isFinite(used)
    || typeof windowStartedAt !== 'string' || typeof windowEndsAt !== 'string'
  ) {
    throw new BoardActionError('The shared board returned an invalid action budget.')
  }

  return { limit, used, windowStartedAt, windowEndsAt }
}

export class SupabaseBoardGateway implements BoardGateway {
  readonly mode = 'shared' as const
  private boardId: string | null = null
  private readyPromise: Promise<string> | null = null
  private channel: RealtimeChannel | null = null
  private refreshTimer: number | null = null

  constructor(
    private readonly client: SupabaseClient,
    private readonly boardSlug: string,
  ) {}

  async load(): Promise<BoardSnapshot> {
    const boardId = await this.ensureReady()
    return this.fetchSnapshot(boardId)
  }

  async reset(): Promise<BoardSnapshot> {
    throw new BoardActionError('Reset the shared demo board with the private admin reset command.')
  }

  subscribe(
    onChange: (snapshot: BoardSnapshot) => void,
    onStatus?: (status: BoardConnectionStatus) => void,
  ): () => void {
    let active = true
    onStatus?.('connecting')

    const refresh = () => {
      if (!active || this.refreshTimer !== null) return
      this.refreshTimer = window.setTimeout(() => {
        this.refreshTimer = null
        void this.load()
          .then((snapshot) => {
            if (active) onChange(snapshot)
          })
          .catch(() => onStatus?.('offline'))
      }, 60)
    }

    void this.ensureReady()
      .then((boardId) => {
        if (!active) return
        this.channel = this.client
          .channel(`poster-boy:${boardId}:${crypto.randomUUID()}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'notes', filter: `board_id=eq.${boardId}` },
            refresh,
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'pins', filter: `board_id=eq.${boardId}` },
            refresh,
          )
          .subscribe((status) => {
            if (!active) return
            if (status === 'SUBSCRIBED') {
              onStatus?.('live')
              refresh()
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              onStatus?.('offline')
            } else {
              onStatus?.('connecting')
            }
          })
      })
      .catch(() => onStatus?.('offline'))

    return () => {
      active = false
      if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer)
      this.refreshTimer = null
      if (this.channel) void this.client.removeChannel(this.channel)
      this.channel = null
    }
  }

  async createText(text: string, placement: NotePlacement): Promise<BoardSnapshot> {
    return this.mutate('create_text_note', {
      p_board_slug: this.boardSlug,
      p_text: text,
      ...this.placementArguments(placement),
    })
  }

  async createDrawing(drawing: DrawingData, placement: NotePlacement): Promise<BoardSnapshot> {
    return this.mutate('create_drawing_note', {
      p_board_slug: this.boardSlug,
      p_drawing: drawing,
      ...this.placementArguments(placement),
    })
  }

  async addPin(position: PinPosition): Promise<BoardSnapshot> {
    return this.mutate('add_pin', {
      p_board_slug: this.boardSlug,
      p_x: position.x,
      p_y: position.y,
    })
  }

  async removePin(pinId: string): Promise<BoardSnapshot> {
    return this.mutate('remove_pin', {
      p_board_slug: this.boardSlug,
      p_pin_id: pinId,
    })
  }

  async removeNote(noteId: string): Promise<BoardSnapshot> {
    return this.mutate('remove_note', {
      p_board_slug: this.boardSlug,
      p_note_id: noteId,
    })
  }

  private placementArguments(placement: NotePlacement) {
    return {
      p_board_x: placement.boardX,
      p_board_y: placement.boardY,
      p_rotation: placement.rotation,
      p_color: placement.color,
    }
  }

  private async mutate(functionName: string, arguments_: Record<string, unknown>) {
    await this.ensureReady()
    const { error } = await this.client.rpc(functionName, arguments_)
    if (error) throw new BoardActionError(error.message)
    return this.load()
  }

  private ensureReady(): Promise<string> {
    if (this.boardId) return Promise.resolve(this.boardId)
    if (this.readyPromise) return this.readyPromise

    const attempt = this.initialize()
    this.readyPromise = attempt
    void attempt.catch(() => {
      if (this.readyPromise === attempt) this.readyPromise = null
    })
    return attempt
  }

  private async initialize(): Promise<string> {
    const { data: sessionData, error: sessionError } = await this.client.auth.getSession()
    if (sessionError) throw new BoardActionError(sessionError.message)

    if (!sessionData.session) {
      const { error } = await this.client.auth.signInAnonymously()
      if (error) {
        throw new BoardActionError(`Anonymous access is unavailable: ${error.message}`)
      }
    }

    const { data, error } = await this.client
      .from('boards')
      .select('id')
      .eq('slug', this.boardSlug)
      .single()
    if (error || !data?.id) {
      throw new BoardActionError(`Shared board "${this.boardSlug}" was not found.`)
    }

    this.boardId = data.id
    return data.id
  }

  private async fetchSnapshot(boardId: string): Promise<BoardSnapshot> {
    const removedCutoff = new Date(Date.now() - REMOVED_NOTE_RETENTION_MS).toISOString()
    const [notesResult, pinsResult, budgetResult] = await Promise.all([
      this.client
        .from('notes')
        .select('id, created_at, content_type, text_content, drawing_data, board_x, board_y, rotation, color, removed_at')
        .eq('board_id', boardId)
        .or(`removed_at.is.null,removed_at.gte.${removedCutoff}`)
        .order('created_at', { ascending: true }),
      this.client
        .from('pins')
        .select('id, created_at, x, y')
        .eq('board_id', boardId)
        .order('created_at', { ascending: true }),
      this.client.rpc('get_action_budget', { p_board_slug: this.boardSlug }),
    ])

    if (notesResult.error) throw new BoardActionError(notesResult.error.message)
    if (pinsResult.error) throw new BoardActionError(pinsResult.error.message)
    if (budgetResult.error) throw new BoardActionError(budgetResult.error.message)

    return {
      notes: (notesResult.data as NoteRow[]).map(mapRemoteNote),
      pins: (pinsResult.data as PinRow[]).map((pin) => ({
        id: pin.id,
        createdAt: pin.created_at,
        x: pin.x,
        y: pin.y,
      })),
      budget: parseRemoteBudget(budgetResult.data),
    }
  }
}

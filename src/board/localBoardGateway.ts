import {
  ACTION_LIMIT,
  ACTION_WINDOW_MS,
  MAX_ACTIVE_NOTES,
  MAX_TEXT_LENGTH,
} from '../constants'
import { seedNotes, seedPins } from '../data/seedNotes'
import { validateDrawing } from '../drawing/validation'
import { isPinPositionAvailable, noteHasPins, pinTouchesNote } from './pinPlacement'
import type {
  ActionBudget,
  BoardNote,
  BoardPin,
  BoardSnapshot,
  DrawingData,
  NotePlacement,
  PinPosition,
} from '../types'
import { BoardActionError, type BoardGateway } from './BoardGateway'

const STORAGE_KEY = 'poster-boy-board-v3'
const ACTOR_KEY = 'poster-boy-visitor-v1'
const CHANNEL_NAME = 'poster-boy-board-events'

interface StoredBoard {
  version: 3
  notes: BoardNote[]
  pins: BoardPin[]
  budgets: Record<string, ActionBudget>
}

const freshBudget = (now = Date.now()): ActionBudget => ({
  limit: ACTION_LIMIT,
  used: 0,
  windowStartedAt: new Date(now).toISOString(),
  windowEndsAt: new Date(now + ACTION_WINDOW_MS).toISOString(),
})

const cloneSeedNotes = () => structuredClone(seedNotes)
const cloneSeedPins = () => structuredClone(seedPins)

export class LocalBoardGateway implements BoardGateway {
  private readonly actorId: string
  private readonly channel: BroadcastChannel | null

  constructor() {
    const existingActor = sessionStorage.getItem(ACTOR_KEY)
    this.actorId = existingActor ?? crypto.randomUUID()
    sessionStorage.setItem(ACTOR_KEY, this.actorId)
    this.channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null
  }

  async load(): Promise<BoardSnapshot> {
    const board = this.readBoard()
    const budget = this.getCurrentBudget(board)
    this.writeBoard(board, false)
    return this.toSnapshot(board, budget)
  }

  subscribe(onChange: (snapshot: BoardSnapshot) => void): () => void {
    const readLatestForThisVisitor = () => {
      const board = this.readBoard()
      onChange(this.toSnapshot(board, this.getCurrentBudget(board)))
    }
    const onBroadcast = () => readLatestForThisVisitor()
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      readLatestForThisVisitor()
    }

    this.channel?.addEventListener('message', onBroadcast)
    window.addEventListener('storage', onStorage)

    return () => {
      this.channel?.removeEventListener('message', onBroadcast)
      window.removeEventListener('storage', onStorage)
    }
  }

  async createText(text: string, placement: NotePlacement): Promise<BoardSnapshot> {
    const trimmed = text.trim()
    if (!trimmed) throw new BoardActionError('Write something before posting.')
    if (trimmed.length > MAX_TEXT_LENGTH) {
      throw new BoardActionError(`Keep notes under ${MAX_TEXT_LENGTH} characters.`)
    }

    return this.mutate((board) => {
      this.assertBoardHasRoom(board.notes)
      board.notes.push({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        contentType: 'text',
        textContent: trimmed,
        drawingData: null,
        removedAt: null,
        ...placement,
      })
    })
  }

  async createDrawing(drawing: DrawingData, placement: NotePlacement): Promise<BoardSnapshot> {
    const validationError = validateDrawing(drawing)
    if (validationError) throw new BoardActionError(validationError)

    return this.mutate((board) => {
      this.assertBoardHasRoom(board.notes)
      board.notes.push({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        contentType: 'drawing',
        textContent: null,
        drawingData: drawing,
        removedAt: null,
        ...placement,
      })
    })
  }

  async addPin(position: PinPosition): Promise<BoardSnapshot> {
    return this.mutate((board) => {
      if (!isPinPositionAvailable(board.pins, position)) {
        throw new BoardActionError('Place this pin a little farther from the others.')
      }
      if (!board.notes.some((note) => pinTouchesNote(position, note))) {
        throw new BoardActionError('Pins need to touch at least one note.')
      }
      board.pins.push({ id: crypto.randomUUID(), ...position })
    })
  }

  async removePin(pinId: string): Promise<BoardSnapshot> {
    return this.mutate((board) => {
      const pinIndex = board.pins.findIndex((pin) => pin.id === pinId)
      if (pinIndex === -1) throw new BoardActionError('That pin is no longer on the board.')
      board.pins.splice(pinIndex, 1)
    })
  }

  async removeNote(noteId: string): Promise<BoardSnapshot> {
    return this.mutate((board) => {
      const note = this.findActiveNote(board.notes, noteId)
      if (noteHasPins(note, board.pins)) throw new BoardActionError('Remove the pins before taking this note down.')
      note.removedAt = new Date().toISOString()
    })
  }

  private mutate(change: (board: StoredBoard) => void): BoardSnapshot {
    const board = this.readBoard()
    const budget = this.getCurrentBudget(board)
    if (budget.used >= budget.limit) {
      throw new BoardActionError('You are out of actions. Your supply will refill soon.')
    }

    change(board)
    budget.used += 1
    board.budgets[this.actorId] = budget
    const snapshot = this.toSnapshot(board, budget)
    this.writeBoard(board, true)
    return snapshot
  }

  private assertBoardHasRoom(notes: BoardNote[]) {
    if (notes.filter((note) => note.removedAt === null).length >= MAX_ACTIVE_NOTES) {
      throw new BoardActionError('The board is full. Take something down first.')
    }
  }

  private findActiveNote(notes: BoardNote[], noteId: string): BoardNote {
    const note = notes.find((candidate) => candidate.id === noteId && candidate.removedAt === null)
    if (!note) throw new BoardActionError('That note is no longer on the board.')
    return note
  }

  private getCurrentBudget(board: StoredBoard): ActionBudget {
    const existing = board.budgets[this.actorId]
    const budget = !existing || Date.parse(existing.windowEndsAt) <= Date.now()
      ? freshBudget()
      : existing
    board.budgets[this.actorId] = budget
    return budget
  }

  private readBoard(): StoredBoard {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return { version: 3, notes: cloneSeedNotes(), pins: cloneSeedPins(), budgets: {} }

    try {
      const parsed = JSON.parse(stored) as StoredBoard
      if (parsed.version !== 3 || !Array.isArray(parsed.notes) || !Array.isArray(parsed.pins)) {
        throw new Error('Invalid board')
      }
      return parsed
    } catch {
      return { version: 3, notes: cloneSeedNotes(), pins: cloneSeedPins(), budgets: {} }
    }
  }

  private writeBoard(board: StoredBoard, announce: boolean) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
    if (announce) this.channel?.postMessage({ type: 'board-changed' })
  }

  private toSnapshot(board: StoredBoard, budget: ActionBudget): BoardSnapshot {
    return {
      notes: structuredClone(board.notes.filter((note) =>
        note.removedAt === null || Date.now() - Date.parse(note.removedAt) < 600,
      )),
      pins: structuredClone(board.pins),
      budget: { ...budget },
    }
  }
}

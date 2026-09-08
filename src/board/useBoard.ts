import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BoardGateway } from './BoardGateway'
import { LocalBoardGateway } from './localBoardGateway'
import type { BoardSnapshot, DrawingData, NotePlacement, PinPosition } from '../types'

type Mutation = () => Promise<BoardSnapshot>

export function useBoard() {
  const gateway = useMemo<BoardGateway>(() => new LocalBoardGateway(), [])
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null)
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void gateway.load().then((initial) => {
      if (current) setSnapshot(initial)
    })
    const unsubscribe = gateway.subscribe((next) => {
      if (current) setSnapshot(next)
    })
    return () => {
      current = false
      unsubscribe()
    }
  }, [gateway])

  useEffect(() => {
    if (!snapshot) return
    const milliseconds = Date.parse(snapshot.budget.windowEndsAt) - Date.now() + 250
    if (milliseconds <= 0) {
      void gateway.load().then(setSnapshot)
      return
    }
    const timeout = window.setTimeout(() => {
      void gateway.load().then(setSnapshot)
    }, milliseconds)
    return () => window.clearTimeout(timeout)
  }, [gateway, snapshot])

  useEffect(() => {
    if (!snapshot?.notes.some((note) => note.removedAt !== null)) return
    const timeout = window.setTimeout(() => {
      setSnapshot((current) => current
        ? { ...current, notes: current.notes.filter((note) => note.removedAt === null) }
        : current)
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [snapshot])

  const runMutation = useCallback(async (mutation: Mutation, noteId?: string) => {
    setMessage(null)
    if (noteId) setPendingNoteId(noteId)
    else setIsPosting(true)

    try {
      setSnapshot(await mutation())
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong. Try again.')
      return false
    } finally {
      setPendingNoteId(null)
      setIsPosting(false)
    }
  }, [])

  return {
    snapshot,
    pendingNoteId,
    isPosting,
    message,
    clearMessage: () => setMessage(null),
    createText: (text: string, placement: NotePlacement) =>
      runMutation(() => gateway.createText(text, placement)),
    createDrawing: (drawing: DrawingData, placement: NotePlacement) =>
      runMutation(() => gateway.createDrawing(drawing, placement)),
    addPin: (position: PinPosition) => runMutation(() => gateway.addPin(position)),
    removePin: (pinId: string) => runMutation(() => gateway.removePin(pinId)),
    removeNote: (noteId: string) => runMutation(() => gateway.removeNote(noteId), noteId),
  }
}

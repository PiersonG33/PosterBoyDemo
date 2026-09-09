import { useCallback, useEffect, useMemo, useState } from 'react'
import { REMOVED_NOTE_RETENTION_MS } from '../constants'
import type { DemoSettings } from '../demoSettings'
import type { BoardSnapshot, DrawingData, NotePlacement, PinPosition } from '../types'
import type { BoardConnectionStatus, BoardGateway } from './BoardGateway'
import { createBoardGateway } from './createBoardGateway'

type Mutation = () => Promise<BoardSnapshot>

export function useBoard(settings: DemoSettings) {
  const gateway = useMemo<BoardGateway>(() => createBoardGateway(settings), [settings])
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null)
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<BoardConnectionStatus>(
    gateway.mode === 'local' ? 'local' : 'connecting',
  )

  useEffect(() => {
    let current = true
    void gateway.load()
      .then((initial) => {
        if (current) setSnapshot(initial)
      })
      .catch((error) => {
        if (!current) return
        setConnectionStatus('offline')
        setMessage(error instanceof Error ? error.message : 'The shared board is unavailable.')
      })
    const unsubscribe = gateway.subscribe((next) => {
      if (current) setSnapshot(next)
    }, (status) => {
      if (current) setConnectionStatus(status)
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
      void gateway.load()
        .then(setSnapshot)
        .catch((error) => {
          setConnectionStatus('offline')
          setMessage(error instanceof Error ? error.message : 'The shared board is unavailable.')
        })
      return
    }
    const timeout = window.setTimeout(() => {
      void gateway.load()
        .then(setSnapshot)
        .catch((error) => {
          setConnectionStatus('offline')
          setMessage(error instanceof Error ? error.message : 'The shared board is unavailable.')
        })
    }, milliseconds)
    return () => window.clearTimeout(timeout)
  }, [gateway, snapshot])

  useEffect(() => {
    if (!snapshot?.notes.some((note) => note.removedAt !== null)) return
    const timeout = window.setTimeout(() => {
      setSnapshot((current) => current
        ? { ...current, notes: current.notes.filter((note) => note.removedAt === null) }
        : current)
    }, settings.curvedPeel ? REMOVED_NOTE_RETENTION_MS : 500)
    return () => window.clearTimeout(timeout)
  }, [settings.curvedPeel, snapshot])

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
    connectionStatus,
    gatewayMode: gateway.mode,
    clearMessage: () => setMessage(null),
    resetBoard: () => runMutation(() => gateway.reset()),
    createText: (text: string, placement: NotePlacement) =>
      runMutation(() => gateway.createText(text, placement)),
    createDrawing: (drawing: DrawingData, placement: NotePlacement) =>
      runMutation(() => gateway.createDrawing(drawing, placement)),
    addPin: (position: PinPosition) => runMutation(() => gateway.addPin(position)),
    removePin: (pinId: string) => runMutation(() => gateway.removePin(pinId)),
    removeNote: (noteId: string) => runMutation(() => gateway.removeNote(noteId), noteId),
  }
}

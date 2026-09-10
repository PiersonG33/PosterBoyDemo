import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { REMOVED_NOTE_RETENTION_MS } from '../constants'
import type { DemoSettings } from '../demoSettings'
import type { BoardSnapshot, DrawingData, NotePlacement, PinPosition } from '../types'
import type { BoardConnectionStatus, BoardGateway } from './BoardGateway'
import { createBoardGateway } from './createBoardGateway'
import {
  applyOptimisticRemovals,
  type OptimisticNoteRemoval,
} from './optimisticRemovals'

type Mutation = () => Promise<BoardSnapshot>
const NOTE_REMOVAL_ECHO_SUPPRESSION_MS = 5_000

export function useBoard(settings: DemoSettings) {
  const gateway = useMemo<BoardGateway>(() => createBoardGateway(settings), [settings])
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null)
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<BoardConnectionStatus>(
    gateway.mode === 'local' ? 'local' : 'connecting',
  )
  const optimisticNoteRemovals = useRef(new Map<string, OptimisticNoteRemoval>())
  const optimisticPinRemovals = useRef(new Set<string>())
  const acceptSnapshot = useCallback((next: BoardSnapshot) => {
    const now = Date.now()
    for (const [id, removal] of optimisticNoteRemovals.current) {
      if (removal.releaseAfter !== null && now >= removal.releaseAfter) {
        optimisticNoteRemovals.current.delete(id)
      }
    }

    setSnapshot(applyOptimisticRemovals(
      next,
      optimisticNoteRemovals.current,
      optimisticPinRemovals.current,
      now,
    ))
  }, [])

  useEffect(() => {
    let current = true
    void gateway.load()
      .then((initial) => {
        if (current) acceptSnapshot(initial)
      })
      .catch((error) => {
        if (!current) return
        setConnectionStatus('offline')
        setMessage(error instanceof Error ? error.message : 'The shared board is unavailable.')
      })
    const unsubscribe = gateway.subscribe((next) => {
      if (current) acceptSnapshot(next)
    }, (status) => {
      if (current) setConnectionStatus(status)
    })
    return () => {
      current = false
      unsubscribe()
    }
  }, [acceptSnapshot, gateway])

  useEffect(() => {
    if (!snapshot) return
    const milliseconds = Date.parse(snapshot.budget.windowEndsAt) - Date.now() + 250
    if (milliseconds <= 0) {
      void gateway.load()
        .then(acceptSnapshot)
        .catch((error) => {
          setConnectionStatus('offline')
          setMessage(error instanceof Error ? error.message : 'The shared board is unavailable.')
        })
      return
    }
    const timeout = window.setTimeout(() => {
      void gateway.load()
        .then(acceptSnapshot)
        .catch((error) => {
          setConnectionStatus('offline')
          setMessage(error instanceof Error ? error.message : 'The shared board is unavailable.')
        })
    }, milliseconds)
    return () => window.clearTimeout(timeout)
  }, [acceptSnapshot, gateway, snapshot])

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
      acceptSnapshot(await mutation())
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong. Try again.')
      return false
    } finally {
      setPendingNoteId(null)
      setIsPosting(false)
    }
  }, [acceptSnapshot])

  const runOptimisticRemoval = useCallback(async (
    kind: 'note' | 'pin',
    id: string,
    mutation: Mutation,
  ) => {
    setMessage(null)
    if (kind === 'note') {
      setPendingNoteId(id)
      const now = Date.now()
      optimisticNoteRemovals.current.set(id, {
        removedAt: new Date(now).toISOString(),
        hideAfter: now + (settings.curvedPeel ? REMOVED_NOTE_RETENTION_MS : 500),
        releaseAfter: null,
      })
    } else {
      setIsPosting(true)
      optimisticPinRemovals.current.add(id)
    }

    setSnapshot((current) => current
      ? applyOptimisticRemovals(
        current,
        optimisticNoteRemovals.current,
        optimisticPinRemovals.current,
      )
      : current)

    try {
      const next = await mutation()
      if (kind === 'note') {
        const removal = optimisticNoteRemovals.current.get(id)
        if (removal) {
          optimisticNoteRemovals.current.set(id, {
            ...removal,
            releaseAfter: Date.now() + NOTE_REMOVAL_ECHO_SUPPRESSION_MS,
          })
        }
      } else optimisticPinRemovals.current.delete(id)
      acceptSnapshot(next)
      return true
    } catch (error) {
      if (kind === 'note') optimisticNoteRemovals.current.delete(id)
      else optimisticPinRemovals.current.delete(id)
      setMessage(error instanceof Error ? error.message : 'Something went wrong. Try again.')

      try {
        acceptSnapshot(await gateway.load())
      } catch {
        // Keep the optimistic result until Realtime reconnects when the server outcome is unknown.
      }
      return false
    } finally {
      setPendingNoteId(null)
      setIsPosting(false)
    }
  }, [acceptSnapshot, gateway, settings.curvedPeel])

  const resetBoard = useCallback(() => {
    optimisticNoteRemovals.current.clear()
    optimisticPinRemovals.current.clear()
    return runMutation(() => gateway.reset())
  }, [gateway, runMutation])

  return {
    snapshot,
    pendingNoteId,
    isPosting,
    message,
    connectionStatus,
    gatewayMode: gateway.mode,
    clearMessage: () => setMessage(null),
    resetBoard,
    createText: (text: string, placement: NotePlacement) =>
      runMutation(() => gateway.createText(text, placement)),
    createDrawing: (drawing: DrawingData, placement: NotePlacement) =>
      runMutation(() => gateway.createDrawing(drawing, placement)),
    addPin: (position: PinPosition) => runMutation(() => gateway.addPin(position)),
    removePin: (pinId: string) => runOptimisticRemoval(
      'pin',
      pinId,
      () => gateway.removePin(pinId),
    ),
    removeNote: (noteId: string) => runOptimisticRemoval(
      'note',
      noteId,
      () => gateway.removeNote(noteId),
    ),
  }
}

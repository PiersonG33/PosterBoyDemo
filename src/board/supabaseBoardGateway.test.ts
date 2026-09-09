import { describe, expect, it } from 'vitest'
import { mapRemoteNote, parseRemoteBudget } from './supabaseBoardGateway'

describe('Supabase board mapping', () => {
  it('maps database text notes into the UI model', () => {
    expect(mapRemoteNote({
      id: 'note-1',
      created_at: '2026-09-09T12:00:00.000Z',
      content_type: 'text',
      text_content: 'hello',
      drawing_data: null,
      board_x: 0.25,
      board_y: 0.4,
      rotation: -1.5,
      color: 'mint',
      removed_at: null,
    })).toMatchObject({
      id: 'note-1',
      contentType: 'text',
      textContent: 'hello',
      boardX: 0.25,
      boardY: 0.4,
      color: 'mint',
    })
  })

  it('parses the per-visitor action budget returned by the RPC', () => {
    expect(parseRemoteBudget({
      limit: 20,
      used: 7,
      windowStartedAt: '2026-09-09T12:00:00.000Z',
      windowEndsAt: '2026-09-09T12:10:00.000Z',
    })).toEqual({
      limit: 20,
      used: 7,
      windowStartedAt: '2026-09-09T12:00:00.000Z',
      windowEndsAt: '2026-09-09T12:10:00.000Z',
    })
  })

  it('rejects malformed shared-board data', () => {
    expect(() => mapRemoteNote({
      id: 'note-1',
      created_at: '2026-09-09T12:00:00.000Z',
      content_type: 'text',
      text_content: 'hello',
      drawing_data: null,
      board_x: 0.25,
      board_y: 0.4,
      rotation: 0,
      color: 'orange',
      removed_at: null,
    })).toThrow(/invalid note color/i)
    expect(() => parseRemoteBudget({ limit: 20 })).toThrow(/invalid action budget/i)
  })
})

// CUSTOM WORD BOMB — remote lobby shape and server-clock tests.

import { describe, expect, it } from 'vitest'
import { mapOnlineLobby } from './online'

describe('online Word Bomb lobby mapping', () => {
  it('maps a server deadline onto the local clock', () => {
    const receivedAt = Date.parse('2026-09-12T20:00:00Z')
    const lobby = mapOnlineLobby({
      id: 'lobby-1',
      code: 'ABC234',
      status: 'playing',
      startingLives: 2,
      minimumPromptWords: 3,
      startingTurnSeconds: 18,
      speedUpSeconds: 0.5,
      currentPlayerId: 'player-1',
      prompt: 'ca',
      deadlineAt: '2026-09-12T20:00:08Z',
      serverTime: '2026-09-12T20:00:00Z',
      usedWords: [],
      round: 1,
      completedTurns: 0,
      winnerPlayerId: null,
      revision: 4,
      isHost: true,
      youPlayerId: 'player-1',
      lastEvent: { type: 'started', playerId: 'player-1', word: null },
      lastExamples: [],
      events: [
        {
          id: 1,
          type: 'success',
          playerName: 'Ash',
          word: 'cat',
          prompt: 'ca',
          reason: null,
          examples: [],
        },
      ],
      players: [
        { id: 'player-1', name: 'Ash', seat: 1, lives: 2, isSpectator: false },
        { id: 'player-2', name: 'Misty', seat: 2, lives: 2, isSpectator: false },
      ],
    }, receivedAt)

    expect(lobby.deadlineMs).toBe(receivedAt + 8_000)
    expect(lobby.players.map((player) => player.name)).toEqual(['Ash', 'Misty'])
    expect(lobby.startingTurnSeconds).toBe(18)
    expect(lobby.events[0].word).toBe('cat')
  })

  it('rejects a malformed remote snapshot', () => {
    expect(() => mapOnlineLobby({ status: 'playing' })).toThrow('invalid')
  })
})

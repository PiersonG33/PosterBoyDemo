// CUSTOM WORD BOMB — focused tests for removable game logic.

import { describe, expect, it } from 'vitest'
import {
  buildPromptOptions,
  getExampleWords,
  getTurnDurationSeconds,
  MIN_WORDS_PER_PROMPT,
  normalizeWords,
  validateGuess,
} from './game'
import { DEFAULT_WORDS } from './defaultWords'

describe('Custom Word Bomb rules', () => {
  it('only creates prompts supported by at least three words', () => {
    const words = normalizeWords('camera camel camp candle dog')
    const prompts = buildPromptOptions(words)

    expect(prompts.find((prompt) => prompt.sequence === 'ca')?.matchingWords).toBe(4)
    expect(prompts.every((prompt) => prompt.matchingWords >= MIN_WORDS_PER_PROMPT)).toBe(true)
  })

  it('requires an allowed, unused word containing the prompt', () => {
    const allowed = new Set(['camera', 'camel', 'camp'])

    expect(validateGuess('Camera', 'ca', allowed, new Set())).toEqual({
      valid: true,
      word: 'camera',
    })
    expect(validateGuess('camera', 'ca', allowed, new Set(['camera'])).valid).toBe(false)
    expect(validateGuess('camp', 'me', allowed, new Set()).valid).toBe(false)
  })

  it('suggests short unused examples after a missed turn', () => {
    const examples = getExampleWords(
      'ca',
      new Set(['camera', 'cat', 'candle', 'camel', 'camp']),
      new Set(['cat', 'camp']),
    )

    expect(examples).toEqual(['camel', 'camera', 'candle'])
  })

  it('ships with a useful default prompt pool', () => {
    expect(DEFAULT_WORDS.length).toBeGreaterThan(500)
    expect(buildPromptOptions(DEFAULT_WORDS).length).toBeGreaterThan(100)
  })

  it('speeds up without becoming impossibly short', () => {
    expect(getTurnDurationSeconds(0)).toBe(12)
    expect(getTurnDurationSeconds(100)).toBe(3.5)
  })
})

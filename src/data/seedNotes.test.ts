import { describe, expect, it } from 'vitest'
import { pinTouchesNote } from '../board/pinPlacement'
import { createSeedNotes, createSeedPins } from './seedNotes'

describe('seed board profiles', () => {
  it('can disable every seeded note rotation', () => {
    expect(createSeedNotes(false).every((note) => note.rotation === 0)).toBe(true)
  })

  it('regenerates seed pins against the configured note size', () => {
    const noteSize = 130.8
    const notes = createSeedNotes(true)
    const pins = createSeedPins(notes, noteSize)

    expect(pins).toHaveLength(46)
    expect(pins.every((pin) => notes.some((note) => pinTouchesNote(pin, note, noteSize)))).toBe(true)
  })
})

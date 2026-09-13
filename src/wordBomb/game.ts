// CUSTOM WORD BOMB — isolated game rules and word-list utilities.

export const MIN_WORDS_PER_PROMPT = 3
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8

export interface PromptOption {
  sequence: string
  matchingWords: number
}

export type GuessResult =
  | { valid: true; word: string }
  | { valid: false; reason: string }

export function normalizeWords(source: string): string[] {
  const matches = source.toLowerCase().match(/[a-z]+/g) ?? []
  return [...new Set(matches.filter((word) => word.length >= 3))]
}

export function buildPromptOptions(words: readonly string[]): PromptOption[] {
  const matchesBySequence = new Map<string, Set<string>>()

  for (const word of words) {
    for (const length of [2, 3]) {
      for (let index = 0; index <= word.length - length; index += 1) {
        const sequence = word.slice(index, index + length)
        const matches = matchesBySequence.get(sequence) ?? new Set<string>()
        matches.add(word)
        matchesBySequence.set(sequence, matches)
      }
    }
  }

  return [...matchesBySequence.entries()]
    .filter(([, matches]) => matches.size >= MIN_WORDS_PER_PROMPT)
    .map(([sequence, matches]) => ({ sequence, matchingWords: matches.size }))
    .sort((left, right) => left.sequence.localeCompare(right.sequence))
}

export function validateGuess(
  rawGuess: string,
  prompt: string,
  allowedWords: ReadonlySet<string>,
  usedWords: ReadonlySet<string>,
): GuessResult {
  const word = rawGuess.trim().toLowerCase()

  if (!/^[a-z]+$/.test(word)) {
    return { valid: false, reason: 'Use letters only.' }
  }
  if (!word.includes(prompt)) {
    return { valid: false, reason: `Your word must contain “${prompt.toUpperCase()}”.` }
  }
  if (!allowedWords.has(word)) {
    return { valid: false, reason: 'That word is not in this game’s word list.' }
  }
  if (usedWords.has(word)) {
    return { valid: false, reason: 'That word has already been used this round.' }
  }

  return { valid: true, word }
}

export function getTurnDurationSeconds(completedTurns: number): number {
  return Math.max(3.5, 12 - completedTurns * 0.42)
}

export function isSkullBomb(completedTurns: number): boolean {
  return completedTurns >= 17 || getTurnDurationSeconds(completedTurns) <= 5
}

export function choosePrompt(
  prompts: readonly PromptOption[],
  previousPrompt = '',
  random: () => number = Math.random,
): string {
  if (prompts.length === 0) return ''
  if (prompts.length === 1) return prompts[0].sequence

  let next = prompts[Math.floor(random() * prompts.length)].sequence
  if (next === previousPrompt) {
    const previousIndex = prompts.findIndex((prompt) => prompt.sequence === previousPrompt)
    next = prompts[(previousIndex + 1) % prompts.length].sequence
  }
  return next
}

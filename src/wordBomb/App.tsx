// CUSTOM WORD BOMB — self-contained pass-and-play game UI.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { DEFAULT_WORDS } from './defaultWords'
import {
  buildPromptOptions,
  choosePrompt,
  getTurnDurationSeconds,
  isSkullBomb,
  MAX_PLAYERS,
  MIN_PLAYERS,
  normalizeWords,
  validateGuess,
  type PromptOption,
} from './game'

interface Player {
  id: string
  name: string
  lives: number
}

interface GameState {
  players: Player[]
  activeIndex: number
  prompt: string
  promptOptions: PromptOption[]
  allowedWords: Set<string>
  usedWords: Set<string>
  turnedPlayerIds: Set<string>
  round: number
  completedTurns: number
  turnToken: number
  startingLives: number
  notice: string
  noticeKind: 'neutral' | 'good' | 'bad'
  winnerId: string | null
}

interface BombTimerProps {
  durationSeconds: number
  skullMode: boolean
  token: number
  onExpire: (token: number) => void
  onTick: (urgent: boolean) => void
}

function BombTimer({ durationSeconds, skullMode, token, onExpire, onTick }: BombTimerProps) {
  const [remainingMs, setRemainingMs] = useState(durationSeconds * 1_000)
  const deadlineRef = useRef(0)
  const expiredRef = useRef(false)
  const lastSecondRef = useRef(Math.ceil(durationSeconds))

  useEffect(() => {
    deadlineRef.current = performance.now() + durationSeconds * 1_000
    expiredRef.current = false
    lastSecondRef.current = Math.ceil(durationSeconds)
    const interval = window.setInterval(() => {
      const nextRemaining = Math.max(0, deadlineRef.current - performance.now())
      setRemainingMs(nextRemaining)

      const nextSecond = Math.ceil(nextRemaining / 1_000)
      if (nextSecond < lastSecondRef.current && nextSecond > 0) {
        lastSecondRef.current = nextSecond
        onTick(skullMode || nextRemaining < 3_500)
      }

      if (nextRemaining === 0 && !expiredRef.current) {
        expiredRef.current = true
        window.clearInterval(interval)
        onExpire(token)
      }
    }, 50)

    return () => window.clearInterval(interval)
  }, [durationSeconds, onExpire, onTick, skullMode, token])

  const fraction = Math.max(0, remainingMs / (durationSeconds * 1_000))
  const timerStyle = { '--wb-time-left': `${fraction * 100}%` } as CSSProperties

  return (
    <div className="wb-timer" style={timerStyle} aria-label={`${(remainingMs / 1_000).toFixed(1)} seconds left`}>
      <span>{(remainingMs / 1_000).toFixed(1)}</span>
      <div className="wb-timer__track" aria-hidden="true"><i /></div>
    </div>
  )
}

function createGame(
  playerNames: string[],
  lives: number,
  words: string[],
  prompts: PromptOption[],
): GameState {
  return {
    players: playerNames.map((name, index) => ({ id: `player-${index + 1}`, name, lives })),
    activeIndex: 0,
    prompt: choosePrompt(prompts),
    promptOptions: prompts,
    allowedWords: new Set(words),
    usedWords: new Set(),
    turnedPlayerIds: new Set(),
    round: 1,
    completedTurns: 0,
    turnToken: 1,
    startingLives: lives,
    notice: `${playerNames[0]} starts. Find a word!`,
    noticeKind: 'neutral',
    winnerId: null,
  }
}

function nextLivingPlayerIndex(players: Player[], currentIndex: number): number {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (currentIndex + offset) % players.length
    if (players[index].lives > 0) return index
  }
  return currentIndex
}

function finishTurn(game: GameState, acceptedWord: string | null): GameState {
  const activePlayer = game.players[game.activeIndex]
  const players = game.players.map((player, index) => (
    acceptedWord === null && index === game.activeIndex
      ? { ...player, lives: Math.max(0, player.lives - 1) }
      : player
  ))
  const livingPlayers = players.filter((player) => player.lives > 0)

  if (livingPlayers.length === 1) {
    return {
      ...game,
      players,
      winnerId: livingPlayers[0].id,
      notice: `${livingPlayers[0].name} is the last player standing!`,
      noticeKind: 'good',
    }
  }

  const turnedPlayerIds = new Set(game.turnedPlayerIds).add(activePlayer.id)
  const roundFinished = livingPlayers.every((player) => turnedPlayerIds.has(player.id))
  const usedWords = new Set(game.usedWords)
  if (acceptedWord) usedWords.add(acceptedWord)
  if (roundFinished) usedWords.clear()

  const activeIndex = nextLivingPlayerIndex(players, game.activeIndex)
  const completedTurns = game.completedTurns + 1
  const nextPlayer = players[activeIndex]
  const lostLastLife = acceptedWord === null && players[game.activeIndex].lives === 0
  const result = acceptedWord
    ? `${activePlayer.name}: ${acceptedWord.toUpperCase()} — nice!`
    : `${activePlayer.name} lost a life${lostLastLife ? ' and is out' : ''}.`

  return {
    ...game,
    players,
    activeIndex,
    prompt: choosePrompt(game.promptOptions, game.prompt),
    usedWords,
    turnedPlayerIds: roundFinished ? new Set() : turnedPlayerIds,
    round: roundFinished ? game.round + 1 : game.round,
    completedTurns,
    turnToken: game.turnToken + 1,
    notice: `${result} ${nextPlayer.name} is up.`,
    noticeKind: acceptedWord ? 'good' : 'bad',
  }
}

export default function WordBombApp() {
  const [playerNames, setPlayerNames] = useState(['Player 1', 'Player 2'])
  const [startingLives, setStartingLives] = useState(2)
  const [wordList, setWordList] = useState(DEFAULT_WORDS)
  const [wordListName, setWordListName] = useState('Built-in English list')
  const [setupError, setSetupError] = useState('')
  const [game, setGame] = useState<GameState | null>(null)
  const [guess, setGuess] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const soundEnabledRef = useRef(soundEnabled)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  const promptOptions = useMemo(() => buildPromptOptions(wordList), [wordList])

  const ensureAudio = useCallback(() => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext()
    if (audioContextRef.current.state === 'suspended') void audioContextRef.current.resume()
  }, [])

  const playTone = useCallback((urgent: boolean, explosion = false) => {
    if (!soundEnabledRef.current) return
    const context = audioContextRef.current
    if (!context || context.state !== 'running') return

    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = explosion ? 'sawtooth' : 'square'
    oscillator.frequency.setValueAtTime(explosion ? 90 : urgent ? 880 : 560, context.currentTime)
    if (explosion) oscillator.frequency.exponentialRampToValueAtTime(38, context.currentTime + 0.28)
    gain.gain.setValueAtTime(explosion ? 0.12 : 0.035, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (explosion ? 0.3 : 0.045))
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + (explosion ? 0.31 : 0.05))
  }, [])

  const handleExpire = useCallback((token: number) => {
    playTone(true, true)
    setGame((current) => (
      current && current.turnToken === token && !current.winnerId
        ? finishTurn(current, null)
        : current
    ))
    setGuess('')
  }, [playTone])

  const updatePlayerName = (index: number, name: string) => {
    setPlayerNames((current) => current.map((playerName, playerIndex) => (
      playerIndex === index ? name : playerName
    )))
  }

  const handleWordListUpload = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 2_000_000) {
      setSetupError('Please use a word-list file smaller than 2 MB.')
      return
    }

    const words = normalizeWords(await file.text())
    const prompts = buildPromptOptions(words)
    if (prompts.length === 0) {
      setSetupError('That file has no 2–3 letter sequence shared by at least three words.')
      return
    }

    setWordList(words)
    setWordListName(file.name)
    setSetupError('')
  }

  const startGame = () => {
    const names = playerNames.map((name) => name.trim())
    if (names.some((name) => !name)) {
      setSetupError('Give every player a name.')
      return
    }
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
      setSetupError('Player names need to be unique.')
      return
    }
    if (promptOptions.length === 0) {
      setSetupError('This word list cannot make a prompt with at least three valid answers.')
      return
    }

    if (soundEnabled) ensureAudio()
    setSetupError('')
    setGuess('')
    setGame(createGame(names, startingLives, wordList, promptOptions))
  }

  const submitGuess = (event: FormEvent) => {
    event.preventDefault()
    if (!game || game.winnerId) return

    const token = game.turnToken
    const result = validateGuess(guess, game.prompt, game.allowedWords, game.usedWords)
    if (!result.valid) {
      setGame((current) => current && current.turnToken === token
        ? { ...current, notice: result.reason, noticeKind: 'bad' }
        : current)
      return
    }

    playTone(false)
    setGame((current) => current && current.turnToken === token
      ? finishTurn(current, result.word)
      : current)
    setGuess('')
  }

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    soundEnabledRef.current = next
    if (next) ensureAudio()
  }

  if (!game) {
    return (
      <main className="wb-shell wb-setup-shell">
        <div className="wb-grain" aria-hidden="true" />
        <section className="wb-setup-card">
          <div className="wb-kicker">A pass-and-play word game</div>
          <h1><span>WORD</span> BOMB</h1>
          <p className="wb-intro">Type a word containing the letters before the fuse runs out. Last player alive wins.</p>

          <div className="wb-setup-grid">
            <section className="wb-panel">
              <div className="wb-panel__heading">
                <div><span>01</span><h2>Players</h2></div>
                <small>{playerNames.length}/{MAX_PLAYERS}</small>
              </div>
              <div className="wb-player-inputs">
                {playerNames.map((name, index) => (
                  <label key={index}>
                    <span>Player {index + 1}</span>
                    <input
                      value={name}
                      maxLength={18}
                      onChange={(event) => updatePlayerName(index, event.target.value)}
                    />
                    {playerNames.length > MIN_PLAYERS && (
                      <button
                        type="button"
                        aria-label={`Remove ${name || `player ${index + 1}`}`}
                        onClick={() => setPlayerNames((current) => current.filter((_, i) => i !== index))}
                      >×</button>
                    )}
                  </label>
                ))}
              </div>
              {playerNames.length < MAX_PLAYERS && (
                <button
                  className="wb-add-player"
                  type="button"
                  onClick={() => setPlayerNames((current) => [...current, `Player ${current.length + 1}`])}
                >+ Add player</button>
              )}
            </section>

            <section className="wb-panel">
              <div className="wb-panel__heading">
                <div><span>02</span><h2>Game setup</h2></div>
              </div>
              <label className="wb-lives-setting">
                <span>Lives per player</span>
                <div>
                  {[1, 2, 3, 4, 5].map((lives) => (
                    <button
                      key={lives}
                      className={startingLives === lives ? 'is-selected' : ''}
                      type="button"
                      onClick={() => setStartingLives(lives)}
                      aria-pressed={startingLives === lives}
                    >{lives}</button>
                  ))}
                </div>
              </label>

              <div className="wb-word-list">
                <div className="wb-word-list__summary">
                  <span>Word list</span>
                  <strong>{wordListName}</strong>
                  <small>{wordList.length.toLocaleString()} words · {promptOptions.length.toLocaleString()} safe prompts</small>
                </div>
                <label className="wb-upload">
                  <input
                    type="file"
                    accept=".txt,.csv,text/plain,text/csv"
                    onChange={(event) => void handleWordListUpload(event.target.files?.[0])}
                  />
                  Upload .txt or .csv
                </label>
                {wordList !== DEFAULT_WORDS && (
                  <button
                    className="wb-reset-list"
                    type="button"
                    onClick={() => {
                      setWordList(DEFAULT_WORDS)
                      setWordListName('Built-in English list')
                      setSetupError('')
                    }}
                  >Use built-in list</button>
                )}
                <p>Words may be separated by lines, spaces, or commas. Prompts are only drawn when at least 3 words support them.</p>
              </div>
            </section>
          </div>

          {setupError && <p className="wb-setup-error" role="alert">{setupError}</p>}
          <div className="wb-setup-actions">
            <a href="../">← Poster Boy</a>
            <button className="wb-sound-button" type="button" onClick={toggleSound} aria-pressed={soundEnabled}>
              {soundEnabled ? 'Sound on' : 'Sound off'}
            </button>
            <button className="wb-start-button" type="button" onClick={startGame}>Light the fuse <span>→</span></button>
          </div>
        </section>
      </main>
    )
  }

  const activePlayer = game.players[game.activeIndex]
  const winner = game.players.find((player) => player.id === game.winnerId)
  const skullMode = isSkullBomb(game.completedTurns)
  const durationSeconds = getTurnDurationSeconds(game.completedTurns)
  const angleStep = 360 / game.players.length
  const activeAngle = -90 + game.activeIndex * angleStep

  return (
    <main className={`wb-shell wb-game-shell ${skullMode ? 'wb-game-shell--skull' : ''}`}>
      <div className="wb-grain" aria-hidden="true" />
      <header className="wb-game-header">
        <button className="wb-logo" type="button" onClick={() => setGame(null)}><span>WORD</span> BOMB</button>
        <div className="wb-round">Round <strong>{game.round}</strong><span>·</span>{game.usedWords.size} word{game.usedWords.size === 1 ? '' : 's'} used</div>
        <button className="wb-icon-button" type="button" onClick={toggleSound} aria-label={soundEnabled ? 'Mute sounds' : 'Turn sounds on'}>
          {soundEnabled ? '♪' : '×♪'}
        </button>
      </header>

      <section className="wb-arena" aria-label="Game table">
        <div
          className="wb-turn-arrow"
          style={{ transform: `rotate(${activeAngle}deg)` }}
          aria-hidden="true"
        ><i /></div>

        {game.players.map((player, index) => {
          const angle = (-90 + index * angleStep) * (Math.PI / 180)
          const style = {
            '--wb-player-x': `${50 + Math.cos(angle) * 41}%`,
            '--wb-player-y': `${50 + Math.sin(angle) * 39}%`,
          } as CSSProperties
          return (
            <article
              className={`wb-player ${index === game.activeIndex && !game.winnerId ? 'is-active' : ''} ${player.lives === 0 ? 'is-out' : ''}`}
              style={style}
              key={player.id}
            >
              <span className="wb-player__turn">YOUR TURN</span>
              <strong>{player.name}</strong>
              <span className="wb-player__lives" aria-label={`${player.lives} lives remaining`}>
                {player.lives > 0 ? '♥'.repeat(player.lives) : 'OUT'}
              </span>
            </article>
          )
        })}

        <div className={`wb-bomb ${skullMode ? 'is-skull' : ''}`}>
          <div className="wb-bomb__fuse" aria-hidden="true"><i /><b /></div>
          <div className="wb-bomb__body">
            {skullMode && <span className="wb-skull" aria-hidden="true">☠</span>}
            <small>{skullMode ? 'DEATH ROUND' : 'CONTAINS'}</small>
            <strong>{game.prompt.toUpperCase()}</strong>
          </div>
        </div>
      </section>

      {!winner ? (
        <section className="wb-turn-console">
          <div className={`wb-notice wb-notice--${game.noticeKind}`} role="status">{game.notice}</div>
          <form onSubmit={submitGuess}>
            <label htmlFor="wb-guess">{activePlayer.name}, type your word</label>
            <div className="wb-guess-row">
              <input
                id="wb-guess"
                key={game.turnToken}
                value={guess}
                onChange={(event) => setGuess(event.target.value)}
                placeholder={`word containing “${game.prompt.toUpperCase()}”`}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck="false"
                autoFocus
              />
              <button type="submit">Submit <span>↵</span></button>
            </div>
          </form>
          <BombTimer
            key={game.turnToken}
            durationSeconds={durationSeconds}
            skullMode={skullMode}
            token={game.turnToken}
            onExpire={handleExpire}
            onTick={playTone}
          />
        </section>
      ) : (
        <section className="wb-winner" role="dialog" aria-labelledby="wb-winner-title">
          <span>WINNER</span>
          <h2 id="wb-winner-title">{winner.name}</h2>
          <p>Survived {game.round} round{game.round === 1 ? '' : 's'} and {game.completedTurns} turns.</p>
          <div>
            <button type="button" onClick={() => {
              setGuess('')
              setGame(createGame(game.players.map((player) => player.name), game.startingLives, [...game.allowedWords], game.promptOptions))
            }}>Play again</button>
            <button type="button" onClick={() => {
              setPlayerNames(game.players.map((player) => player.name))
              setStartingLives(game.startingLives)
              setGame(null)
            }}>Change setup</button>
          </div>
        </section>
      )}
    </main>
  )
}

// CUSTOM WORD BOMB — online host/join lobby and synchronized game UI.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { BombTimer } from './BombTimer'
import { AttemptFeed } from './AttemptFeed'
import { DEFAULT_WORDS } from './defaultWords'
import {
  buildPromptOptions,
  DEFAULT_SPEED_UP_SECONDS,
  DEFAULT_STARTING_SECONDS,
  getTurnDurationSeconds,
  isSkullBomb,
  normalizeWords,
} from './game'
import {
  type OnlineConnectionStatus,
  type OnlineLobby,
  type WordBombOnlineService,
} from './online'

interface OnlineWordBombAppProps {
  service: WordBombOnlineService
  initialCode: string
  onBack: () => void
}

function updateLobbyUrl(code?: string) {
  const url = new URL(window.location.href)
  if (code) url.searchParams.set('lobby', code)
  else url.searchParams.delete('lobby')
  window.history.replaceState(null, '', url)
}

export default function OnlineWordBombApp({ service, initialCode, onBack }: OnlineWordBombAppProps) {
  const [hostName, setHostName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joinCode, setJoinCode] = useState(initialCode)
  const [startingLives, setStartingLives] = useState(2)
  const [minimumPromptWords, setMinimumPromptWords] = useState(3)
  const [startingTurnSeconds, setStartingTurnSeconds] = useState(DEFAULT_STARTING_SECONDS)
  const [speedUpSeconds, setSpeedUpSeconds] = useState(DEFAULT_SPEED_UP_SECONDS)
  const [wordList, setWordList] = useState(DEFAULT_WORDS)
  const [wordListName, setWordListName] = useState('Built-in English list')
  const [lobby, setLobby] = useState<OnlineLobby | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<OnlineConnectionStatus>('connecting')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [guessDraft, setGuessDraft] = useState({ revision: -1, value: '' })
  const [soundEnabled, setSoundEnabled] = useState(true)
  const guessInputRef = useRef<HTMLInputElement>(null)
  const soundEnabledRef = useRef(soundEnabled)
  const audioContextRef = useRef<AudioContext | null>(null)
  const resumeAttemptedRef = useRef(false)
  const guess = lobby && guessDraft.revision === lobby.revision ? guessDraft.value : ''

  const promptOptions = useMemo(
    () => buildPromptOptions(wordList, minimumPromptWords),
    [minimumPromptWords, wordList],
  )

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  useEffect(() => {
    if (busy || lobby?.status !== 'playing' || lobby.currentPlayerId !== lobby.youPlayerId) return
    const animationFrame = window.requestAnimationFrame(() => guessInputRef.current?.focus())
    return () => window.cancelAnimationFrame(animationFrame)
  }, [busy, lobby?.currentPlayerId, lobby?.revision, lobby?.status, lobby?.youPlayerId])

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

  const enterLobby = useCallback((nextLobby: OnlineLobby) => {
    setLobby(nextLobby)
    setMessage('')
    updateLobbyUrl(nextLobby.code)
  }, [])

  useEffect(() => {
    if (!initialCode || resumeAttemptedRef.current) return
    resumeAttemptedRef.current = true
    void service.getLobby(initialCode).then(enterLobby).catch(() => undefined)
  }, [enterLobby, initialCode, service])

  const lobbyId = lobby?.id
  const lobbyCode = lobby?.code
  useEffect(() => {
    if (!lobbyId || !lobbyCode) return
    return service.subscribe(
      { id: lobbyId, code: lobbyCode },
      setLobby,
      setConnectionStatus,
    )
  }, [lobbyCode, lobbyId, service])

  const runLobbyAction = async (action: () => Promise<OnlineLobby>) => {
    setBusy(true)
    setMessage('')
    try {
      enterLobby(await action())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The lobby could not be reached.')
    } finally {
      setBusy(false)
    }
  }

  const handleWordListUpload = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 2_000_000) {
      setMessage('Please use a word-list file smaller than 2 MB.')
      return
    }
    const words = normalizeWords(await file.text())
    const prompts = buildPromptOptions(words, minimumPromptWords)
    if (words.length > 10_000) {
      setMessage('Online word lists are limited to 10,000 unique words.')
      return
    }
    if (prompts.length === 0) {
      setMessage(`That file has no 2–3 letter sequence shared by at least ${minimumPromptWords} words.`)
      return
    }
    setWordList(words)
    setWordListName(file.name)
    setMessage('')
  }

  const createLobby = (event: FormEvent) => {
    event.preventDefault()
    if (!hostName.trim()) {
      setMessage('Enter your name before creating a lobby.')
      return
    }
    if (promptOptions.length === 0) {
      setMessage(`No prompt in this word list appears in at least ${minimumPromptWords} words.`)
      return
    }
    ensureAudio()
    void runLobbyAction(() => service.createLobby(
      hostName.trim(),
      startingLives,
      minimumPromptWords,
      startingTurnSeconds,
      speedUpSeconds,
      wordList,
      promptOptions.map((prompt) => prompt.sequence),
    ))
  }

  const joinLobby = (event: FormEvent) => {
    event.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6 || !joinName.trim()) {
      setMessage('Enter your name and the 6-character lobby code.')
      return
    }
    ensureAudio()
    void runLobbyAction(() => service.joinLobby(code, joinName.trim()))
  }

  const returnToModes = () => {
    updateLobbyUrl()
    setLobby(null)
    onBack()
  }

  const leaveLobby = async () => {
    if (!lobby) return
    setBusy(true)
    try {
      await service.leaveLobby(lobby.code)
      returnToModes()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The lobby could not be left.')
      setBusy(false)
    }
  }

  const copyInvite = async () => {
    if (!lobby) return
    const inviteUrl = new URL(window.location.href)
    inviteUrl.searchParams.set('lobby', lobby.code)
    try {
      await navigator.clipboard.writeText(inviteUrl.toString())
      setMessage('Invite link copied.')
    } catch {
      setMessage(`Share lobby code ${lobby.code}.`)
    }
  }

  if (!lobby) {
    return (
      <main className="wb-shell wb-setup-shell">
        <div className="wb-grain" aria-hidden="true" />
        <section className="wb-setup-card wb-online-card">
          <button className="wb-back-link" type="button" onClick={onBack}>← Game modes</button>
          <div className="wb-kicker">Live online multiplayer</div>
          <h1><span>WORD</span> BOMB</h1>
          <p className="wb-intro">Create a private room, share its six-character code, and play together from separate devices.</p>

          <div className="wb-online-menu">
            <form className="wb-panel wb-online-form" onSubmit={createLobby}>
              <div className="wb-panel__heading"><div><span>HOST</span><h2>Create a lobby</h2></div></div>
              <label className="wb-online-field">
                <span>Your name</span>
                <input value={hostName} maxLength={18} onChange={(event) => setHostName(event.target.value)} placeholder="Host name" />
              </label>
              <label className="wb-lives-setting">
                <span>Lives per player</span>
                <div>
                  {[1, 2, 3, 4, 5].map((lives) => (
                    <button key={lives} className={startingLives === lives ? 'is-selected' : ''} type="button" onClick={() => setStartingLives(lives)}>{lives}</button>
                  ))}
                </div>
              </label>
              <label className="wb-minimum-setting">
                <span>Required answers per prompt</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={minimumPromptWords}
                  onChange={(event) => setMinimumPromptWords(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
                />
                <small>Each letter sequence must appear in at least this many words.</small>
              </label>
              <div className="wb-timing-settings">
                <label>
                  <span>Starting time</span>
                  <div><input type="number" min={5} max={60} value={startingTurnSeconds} onChange={(event) => setStartingTurnSeconds(Math.min(60, Math.max(5, Number(event.target.value) || 5)))} /><small>sec</small></div>
                </label>
                <label>
                  <span>Difficulty increase</span>
                  <div><input type="number" min={0} max={2} step={0.1} value={speedUpSeconds} onChange={(event) => setSpeedUpSeconds(Math.min(2, Math.max(0, Number(event.target.value) || 0)))} /><small>sec / turn</small></div>
                </label>
              </div>
              <div className="wb-word-list wb-word-list--online">
                <div className="wb-word-list__summary">
                  <span>Word list</span>
                  <strong>{wordListName}</strong>
                  <small>{wordList.length.toLocaleString()} words · {promptOptions.length.toLocaleString()} prompts with {minimumPromptWords}+ answers</small>
                </div>
                <label className="wb-upload">
                  <input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(event) => void handleWordListUpload(event.target.files?.[0])} />
                  Upload list
                </label>
                {wordList !== DEFAULT_WORDS && (
                  <button className="wb-reset-list" type="button" onClick={() => {
                    setWordList(DEFAULT_WORDS)
                    setWordListName('Built-in English list')
                  }}>Use built-in list</button>
                )}
              </div>
              <button className="wb-online-primary" type="submit" disabled={busy}>Create lobby <span>→</span></button>
            </form>

            <form className="wb-panel wb-online-form" onSubmit={joinLobby}>
              <div className="wb-panel__heading"><div><span>JOIN</span><h2>Enter a code</h2></div></div>
              <label className="wb-online-field">
                <span>Your name</span>
                <input value={joinName} maxLength={18} onChange={(event) => setJoinName(event.target.value)} placeholder="Player name" />
              </label>
              <label className="wb-online-field">
                <span>Lobby code</span>
                <input
                  className="wb-code-input"
                  value={joinCode}
                  maxLength={6}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
                  placeholder="ABC234"
                  autoCapitalize="characters"
                />
              </label>
              <p className="wb-online-help">Ask the host for the code shown in their waiting room. If a game is already active, you can spectate and join the next one.</p>
              <button className="wb-online-primary wb-online-primary--light" type="submit" disabled={busy}>Join lobby <span>→</span></button>
            </form>
          </div>
          {message && <p className="wb-setup-error" role="alert">{message}</p>}
        </section>
      </main>
    )
  }

  if (lobby.status === 'waiting') {
    return (
      <main className="wb-shell wb-lobby-shell">
        <div className="wb-grain" aria-hidden="true" />
        <header className="wb-game-header">
          <button className="wb-logo" type="button" onClick={() => void leaveLobby()}><span>WORD</span> BOMB</button>
          <span className={`wb-live-status wb-live-status--${connectionStatus}`}><i />{connectionStatus}</span>
          <button className="wb-leave-button" type="button" disabled={busy} onClick={() => void leaveLobby()}>Leave lobby</button>
        </header>
        <section className="wb-lobby-card">
          <span className="wb-lobby-eyebrow">Waiting room</span>
          <h1>Lobby <strong>{lobby.code}</strong></h1>
          <button className="wb-copy-code" type="button" onClick={() => void copyInvite()}>Copy invite link</button>
          <p>Share the code. The game can start when at least two players have joined.</p>
          <div className="wb-lobby-players">
            {lobby.players.map((player) => (
              <div className={player.id === lobby.youPlayerId ? 'is-you' : ''} key={player.id}>
                <span>{player.seat.toString().padStart(2, '0')}</span>
                <strong>{player.name}</strong>
                {player.id === lobby.youPlayerId && <small>YOU</small>}
                {player.seat === 1 && <small>HOST</small>}
              </div>
            ))}
            {Array.from({ length: Math.max(0, 2 - lobby.players.length) }, (_, index) => (
              <div className="is-empty" key={`empty-${index}`}><span>--</span><strong>Waiting for player…</strong></div>
            ))}
          </div>
          {message && <p className="wb-setup-error" role="status">{message}</p>}
          <div className="wb-lobby-actions">
            <span>{lobby.startingLives} lives · {lobby.startingTurnSeconds}s start · {lobby.speedUpSeconds}s faster/turn · {lobby.minimumPromptWords}+ answers per prompt · {lobby.players.length}/8 players</span>
            {lobby.isHost ? (
              <button
                className="wb-start-button"
                type="button"
                disabled={busy || lobby.players.length < 2}
                onClick={() => {
                  ensureAudio()
                  void runLobbyAction(() => service.startLobby(lobby.code))
                }}
              >Start game <span>→</span></button>
            ) : <strong>Waiting for the host…</strong>}
          </div>
        </section>
      </main>
    )
  }

  const activePlayers = lobby.players.filter((player) => !player.isSpectator)
  const spectators = lobby.players.filter((player) => player.isSpectator)
  const activeIndex = Math.max(0, activePlayers.findIndex((player) => player.id === lobby.currentPlayerId))
  const activePlayer = activePlayers[activeIndex]
  const winner = lobby.players.find((player) => player.id === lobby.winnerPlayerId)
  const you = lobby.players.find((player) => player.id === lobby.youPlayerId)
  const isSpectating = you?.isSpectator === true
  const skullMode = isSkullBomb(lobby.completedTurns, lobby.startingTurnSeconds, lobby.speedUpSeconds)
  const durationSeconds = getTurnDurationSeconds(lobby.completedTurns, lobby.startingTurnSeconds, lobby.speedUpSeconds)
  const angleStep = 360 / activePlayers.length
  const activeAngle = -90 + activeIndex * angleStep
  const isMyTurn = lobby.currentPlayerId === lobby.youPlayerId

  const submitGuess = (event: FormEvent) => {
    event.preventDefault()
    if (!isMyTurn || !guess.trim() || busy) return
    const submittedWord = guess
    setGuessDraft({ revision: lobby.revision, value: '' })
    void runLobbyAction(() => service.submitWord(lobby.code, lobby.revision, submittedWord))
  }

  const expireTurn = (revision: number) => {
    playTone(true, true)
    setGuessDraft({ revision: lobby.revision, value: '' })
    void service.expireTurn(lobby.code, revision).then(setLobby).catch(() => setConnectionStatus('offline'))
  }

  return (
    <main className={`wb-shell wb-game-shell ${skullMode ? 'wb-game-shell--skull' : ''}`}>
      <div className="wb-grain" aria-hidden="true" />
      <header className="wb-game-header">
        <div className="wb-online-brand"><span className="wb-logo"><span>WORD</span> BOMB</span><small>{lobby.code}</small></div>
        <div className="wb-round">Round <strong>{lobby.round}</strong><span>·</span>{lobby.usedWords.length} word{lobby.usedWords.length === 1 ? '' : 's'} used</div>
        <div className="wb-online-header-actions">
          {isSpectating && <span className="wb-spectating-badge">Spectating</span>}
          <span className={`wb-live-status wb-live-status--${connectionStatus}`}><i />{connectionStatus}</span>
          {isSpectating && <button className="wb-leave-button" type="button" onClick={() => void leaveLobby()}>Leave</button>}
          <button className="wb-icon-button" type="button" onClick={() => {
            const next = !soundEnabled
            setSoundEnabled(next)
            soundEnabledRef.current = next
            if (next) ensureAudio()
          }}>{soundEnabled ? '♪' : '×♪'}</button>
        </div>
      </header>

      <section className="wb-arena" aria-label="Online game table">
        {spectators.length > 0 && (
          <div className="wb-spectator-list">
            <span>Spectating</span>
            {spectators.map((player) => player.name).join(' · ')}
          </div>
        )}
        <div className="wb-turn-arrow" style={{ transform: `rotate(${activeAngle}deg)` }} aria-hidden="true"><i /></div>
        {activePlayers.map((player, index) => {
          const angle = (-90 + index * angleStep) * (Math.PI / 180)
          const style = {
            '--wb-player-x': `${50 + Math.cos(angle) * 41}%`,
            '--wb-player-y': `${50 + Math.sin(angle) * 39}%`,
          } as CSSProperties
          return (
            <article className={`wb-player ${player.id === lobby.currentPlayerId ? 'is-active' : ''} ${player.lives === 0 ? 'is-out' : ''} ${lobby.lastEvent.type === 'timeout' && lobby.lastEvent.playerId === player.id ? 'is-hit' : ''}`} style={style} key={player.id}>
              <span className="wb-player__turn">{player.id === lobby.youPlayerId ? 'YOUR TURN' : 'PLAYING'}</span>
              <strong>{player.name}{player.id === lobby.youPlayerId ? ' · you' : ''}</strong>
              <span className="wb-player__lives">{player.lives > 0 ? '♥'.repeat(player.lives) : 'OUT'}</span>
              {lobby.lastEvent.type === 'timeout' && lobby.lastEvent.playerId === player.id && <i className="wb-heart-burst" aria-hidden="true">♥</i>}
            </article>
          )
        })}
        <div className={`wb-bomb ${skullMode ? 'is-skull' : ''}`}>
          <div className="wb-bomb__fuse" aria-hidden="true"><i /><b /></div>
          <div className="wb-bomb__body">
            {skullMode && <span className="wb-skull" aria-hidden="true">☠</span>}
            <small>{skullMode ? 'DEATH ROUND' : 'CONTAINS'}</small>
            <strong>{lobby.prompt?.toUpperCase()}</strong>
          </div>
        </div>
      </section>

      {lobby.status === 'finished' && winner ? (
        <section className="wb-winner" role="dialog" aria-labelledby="wb-online-winner-title">
          <span>WINNER</span>
          <h2 id="wb-online-winner-title">{winner.name}</h2>
          <p>Survived {lobby.round} round{lobby.round === 1 ? '' : 's'} and {lobby.completedTurns} turns.</p>
          {lobby.lastExamples.length > 0 && (
            <p className="wb-winner__examples">Missed answers: {lobby.lastExamples.map((word) => word.toUpperCase()).join(' · ')}</p>
          )}
          {lobby.isHost ? (
            <button type="button" disabled={busy} onClick={() => void runLobbyAction(() => service.restartLobby(lobby.code))}>Return to lobby</button>
          ) : <strong>Waiting for the host…</strong>}
        </section>
      ) : (
        <section className="wb-turn-console">
          <AttemptFeed events={lobby.events} />
          <form onSubmit={submitGuess}>
            <label htmlFor="wb-online-guess">{
              isSpectating
                ? 'Spectating — you will join the next game'
                : isMyTurn ? `${activePlayer.name}, type your word` : `Waiting for ${activePlayer.name}`
            }</label>
            <div className="wb-guess-row">
              <input
                id="wb-online-guess"
                key={lobby.revision}
                ref={guessInputRef}
                value={guess}
                maxLength={40}
                onChange={(event) => setGuessDraft({ revision: lobby.revision, value: event.target.value })}
                placeholder={isMyTurn ? `word containing “${lobby.prompt?.toUpperCase()}”` : isSpectating ? 'Watching this game' : 'Not your turn yet'}
                disabled={!isMyTurn || busy}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck="false"
                autoFocus={isMyTurn}
              />
              <button type="submit" disabled={!isMyTurn || busy}>Submit <span>↵</span></button>
            </div>
            {message && <p className="wb-console-error" role="alert">{message}</p>}
          </form>
          {lobby.deadlineMs !== null && (
            <BombTimer
              durationSeconds={durationSeconds}
              deadlineMs={lobby.deadlineMs}
              skullMode={skullMode}
              token={lobby.revision}
              onExpire={expireTurn}
              onTick={playTone}
            />
          )}
        </section>
      )}
    </main>
  )
}

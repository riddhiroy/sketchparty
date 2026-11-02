import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import {
  Check, ChevronRight, CircleHelp, Copy, Crown, Eraser,
  Lightbulb, Link2, MessageCircle, Pencil, Play, Send,
  Sparkles, Timer, Trophy, Users, Wifi, WifiOff, X
} from 'lucide-react'

type Player = { id: string; name: string; score: number; isHost?: boolean }
type ChatLine = { id: string; name: string; text: string; kind: 'guess' | 'system' | 'correct'; playerId?: string }
type Point = { x: number; y: number }
type Stroke = { points: Point[]; color: string; size: number }
type GameState = {
  drawerId: string
  drawerName: string
  round: number
  wordLength: number
  hint: string
  endsAt: number
  status: 'choosing' | 'drawing' | 'ended'
}
type WireMessage =
  | { type: 'stroke'; stroke: Stroke }
  | { type: 'clear' }
  | { type: 'chat'; line: ChatLine }
  | { type: 'players'; players: Player[] }
  | { type: 'round'; state: GameState }
  | { type: 'secret'; word: string; to: string }
  | { type: 'score'; players: Player[] }

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null
const WORDS = ['rainbow', 'telescope', 'watermelon', 'skateboard', 'volcano', 'butterfly', 'popcorn', 'spaceship', 'pancake', 'octopus', 'sunflower', 'treasure']
const COLORS = ['#20202a', '#f45b69', '#ff9f43', '#f7c948', '#36b37e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff']
const makeId = () => Math.random().toString(36).slice(2, 10).toUpperCase()
const makePlayerId = () => {
  const existing = sessionStorage.getItem('sketch-party-player')
  if (existing) return existing
  const id = makeId()
  sessionStorage.setItem('sketch-party-player', id)
  return id
}

export default function App() {
  const playerId = useMemo(makePlayerId, [])
  const [name, setName] = useState(() => localStorage.getItem('sketch-party-name') || '')
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() || '')
  const [room, setRoom] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const [connected, setConnected] = useState(false)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [guess, setGuess] = useState('')
  const [game, setGame] = useState<GameState | null>(null)
  const [secretWord, setSecretWord] = useState('')
  const [wordChoices, setWordChoices] = useState<string[]>([])
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [color, setColor] = useState(COLORS[0])
  const [brushSize, setBrushSize] = useState(5)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [timeLeft, setTimeLeft] = useState(80)
  const [showRules, setShowRules] = useState(false)
  const [copied, setCopied] = useState(false)
  const [localMode, setLocalMode] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const currentStroke = useRef<Point[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<GameState | null>(null)
  const secretRef = useRef('')
  const playersRef = useRef<Player[]>([])
  gameRef.current = game
  secretRef.current = secretWord
  playersRef.current = players
  const isHost = players[0]?.id === playerId

  const addLine = useCallback((line: ChatLine) => setChat(old => [...old.slice(-60), line]), [])
  const send = useCallback((message: WireMessage) => {
    if (channel && connected) void channel.send({ type: 'broadcast', event: 'game', payload: message })
  }, [channel, connected])

  useEffect(() => {
    if (!room || !name.trim()) return
    if (!supabase) {
      setLocalMode(true)
      const localPlayer = { id: playerId, name: name.trim(), score: 0, isHost: true }
      setPlayers([localPlayer])
      setConnected(true)
      addLine({ id: makeId(), name: 'Party bot', text: 'Demo mode is on. Add Supabase settings to play with friends online.', kind: 'system' })
      return
    }
    const roomChannel = supabase.channel('sketch-party-' + room, {
      config: { broadcast: { self: false }, presence: { key: playerId } }
    })
    roomChannel
      .on('broadcast', { event: 'game' }, ({ payload }: { payload: WireMessage }) => {
        if (payload.type === 'stroke') setStrokes(old => [...old, payload.stroke])
        if (payload.type === 'clear') setStrokes([])
        if (payload.type === 'chat') {
          addLine(payload.line)
          const activeGame = gameRef.current
          const answer = secretRef.current
          if (payload.line.kind === 'guess' && activeGame?.drawerId === playerId && answer && payload.line.text.toLowerCase() === answer.toLowerCase() && payload.line.playerId) {
            const updated = playersRef.current.map(p => p.id === payload.line.playerId ? { ...p, score: p.score + Math.max(10, Math.ceil((activeGame.endsAt - Date.now()) / 1000)) } : p)
            playersRef.current = updated
            setPlayers(updated)
            void roomChannel.send({ type: 'broadcast', event: 'game', payload: { type: 'score', players: updated } satisfies WireMessage })
            void roomChannel.send({ type: 'broadcast', event: 'game', payload: { type: 'chat', line: { id: makeId(), name: payload.line.name, text: 'guessed the word!', kind: 'correct' } } satisfies WireMessage })
          }
        }
        if (payload.type === 'players') setPlayers(payload.players)
        if (payload.type === 'round') { setGame(payload.state); setTimeLeft(Math.max(0, Math.ceil((payload.state.endsAt - Date.now()) / 1000))); setStrokes([]) }
        if (payload.type === 'secret' && payload.to === playerId) setSecretWord(payload.word)
        if (payload.type === 'score') setPlayers(payload.players)
      })
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState<{ name: string; score: number; online_at?: string }>()
        const online = Object.entries(state).map(([id, entries]) => ({
          id, name: entries[0]?.name || 'Player', score: entries[0]?.score || 0,
          joinedAt: entries[0]?.online_at || ''
        }))
        online.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id))
        setPlayers(online.map(({ id, name, score }) => ({ id, name, score })))
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          await roomChannel.track({ name: name.trim(), score: 0, online_at: new Date().toISOString() })
          setTimeout(() => {
            void roomChannel.send({ type: 'broadcast', event: 'game', payload: {
              type: 'chat', line: { id: makeId(), name: 'Party bot', text: name + ' joined the party!', kind: 'system' }
            } satisfies WireMessage })
          }, 250)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnected(false)
      })
    setChannel(roomChannel)
    return () => { void supabase.removeChannel(roomChannel) }
  }, [room, name, playerId, addLine])

  useEffect(() => {
    if (!game || game.status !== 'drawing') return
    const timer = window.setInterval(() => setTimeLeft(Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000))), 250)
    return () => window.clearInterval(timer)
  }, [game])

  useEffect(() => {
    if (!game || game.status !== 'drawing' || timeLeft > 0 || game.drawerId !== playerId) return
    const ended: GameState = { ...game, status: 'ended' }
    setGame(ended)
    send({ type: 'round', state: ended })
    addLine({ id: makeId(), name: 'Party bot', text: 'Time is up! The round is over.', kind: 'system' })
  }, [timeLeft, game, playerId, send, addLine])

  useEffect(() => {
    if (!game || game.status !== 'drawing' || timeLeft > 0 || game.drawerId !== playerId) return
    const ended: GameState = { ...game, status: 'ended' }
    setGame(ended)
    send({ type: 'round', state: ended })
    addLine({ id: makeId(), name: 'Party bot', text: 'Time is up! The round is over.', kind: 'system' })
  }, [timeLeft, game, playerId, send, addLine])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (!stroke.points.length) return
    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y)
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    strokes.forEach(stroke => drawStroke(ctx, stroke))
  }, [strokes, drawStroke])

  const createRoom = () => {
    if (!name.trim()) return
    localStorage.setItem('sketch-party-name', name.trim())
    const code = makeId().slice(0, 6)
    setRoomCode(code)
    setRoom(code)
    history.replaceState(null, '', '?room=' + code)
  }
  const joinRoom = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || roomCode.trim().length < 4) return
    localStorage.setItem('sketch-party-name', name.trim())
    const code = roomCode.trim().toUpperCase()
    setRoom(code)
    history.replaceState(null, '', '?room=' + code)
  }
  const startRound = () => {
    const choices = [...WORDS].sort(() => Math.random() - 0.5).slice(0, 3)
    setWordChoices(choices)
    setSecretWord('')
    setGame({ drawerId: playerId, drawerName: name, round: (game?.round || 0) + 1, wordLength: 0, hint: '', endsAt: Date.now() + 80000, status: 'choosing' })
  }
  const chooseWord = (word: string) => {
    setSecretWord(word)
    const state: GameState = { drawerId: playerId, drawerName: name, round: game?.round || 1, wordLength: word.length, hint: word.replace(/[a-z]/g, '_').split('').join(' '), endsAt: Date.now() + 80000, status: 'drawing' }
    setGame(state)
    send({ type: 'round', state })
    send({ type: 'secret', word, to: playerId })
    setStrokes([])
    addLine({ id: makeId(), name: 'Party bot', text: 'Round started! Guess the word.', kind: 'system' })
  }
  const clearCanvas = () => {
    setStrokes([])
    send({ type: 'clear' })
  }
  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!game || game.status !== 'drawing' || game.drawerId !== playerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point = { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) }
    drawingRef.current = true
    currentStroke.current = [point]
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point = { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) }
    currentStroke.current.push(point)
    const stroke = { points: [...currentStroke.current], color: tool === 'eraser' ? '#ffffff' : color, size: tool === 'eraser' ? 24 : brushSize }
    setStrokes(old => [...old.slice(0, -1), stroke])
    send({ type: 'stroke', stroke })
  }
  const pointerUp = () => { drawingRef.current = false; currentStroke.current = [] }
  const submitGuess = (event: FormEvent) => {
    event.preventDefault()
    const text = guess.trim()
    if (!text) return
    if (game?.drawerId === playerId) {
      addLine({ id: makeId(), name: 'Party bot', text: 'You are the artist this round — let everyone else guess!', kind: 'system' })
      setGuess('')
      return
    }
    const line: ChatLine = { id: makeId(), name, text, kind: 'guess', playerId }
    addLine(line)
    send({ type: 'chat', line })
    setGuess('')
  }
  const copyInvite = async () => {
    await navigator.clipboard.writeText(location.origin + location.pathname + '?room=' + room)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  const leaveRoom = () => {
    if (channel && supabase) void supabase.removeChannel(channel)
    setChannel(null); setRoom(''); setConnected(false); setPlayers([]); setGame(null); setStrokes([]); setChat([]); setLocalMode(false)
    history.replaceState(null, '', location.pathname)
  }

  if (!room) return (
    <main className="landing">
      <div className="landing-glow glow-one" /><div className="landing-glow glow-two" />
      <nav className="top-nav"><a className="brand" href="#"><span className="brand-mark"><Pencil size={19} /></span> sketch<span>party</span></a><button className="icon-button" onClick={() => setShowRules(true)} aria-label="How to play"><CircleHelp size={19} /></button></nav>
      <section className="hero">
        <div className="eyebrow"><Sparkles size={14} /> THE INTERNET'S NEW GAME NIGHT</div>
        <h1>Draw it.<br /><span>Guess it.</span><br />Love it.</h1>
        <p className="hero-copy">A little drawing, a lot of bad guesses, and your favourite people. That's the whole party.</p>
        <div className="join-card">
          <label htmlFor="player-name">YOUR PARTY NAME</label>
          <input id="player-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Doodle Queen" maxLength={18} />
          <button className="primary-button" disabled={!name.trim()} onClick={createRoom}>Create a room <ChevronRight size={18} /></button>
          <div className="or-line"><span /> OR JOIN YOUR FRIENDS <span /></div>
          <form className="join-form" onSubmit={joinRoom}><input aria-label="Room code" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="ENTER ROOM CODE" maxLength={8} /><button type="submit" disabled={!name.trim() || roomCode.trim().length < 4}>Join</button></form>
        </div>
        <div className="hero-foot"><span><Users size={15} /> 2–8 players</span><span><Timer size={15} /> 80-second rounds</span><span><Trophy size={15} /> Bragging rights</span></div>
      </section>
      <div className="floating-doodle doodle-star">✳</div><div className="floating-doodle doodle-smile">☺</div><div className="floating-doodle doodle-squiggle">〰</div>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </main>
  )

  const drawer = game?.drawerId === playerId
  return (
    <main className="game-shell">
      <header className="game-topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); leaveRoom() }}><span className="brand-mark"><Pencil size={17} /></span> sketch<span>party</span></a><div className="room-pill"><span className="online-dot" /> ROOM {room}<button onClick={copyInvite} title="Copy invite link">{copied ? <Check size={14} /> : <Copy size={14} />}</button></div><div className="top-right">{localMode ? <span className="connection"><WifiOff size={14} /> Demo</span> : <span className="connection"><Wifi size={14} /> {connected ? 'Connected' : 'Connecting…'}</span>}<button className="icon-button" onClick={() => setShowRules(true)}><CircleHelp size={18} /></button></div></header>
      <div className="game-layout">
        <aside className="players-panel panel"><div className="panel-heading"><span>THE PARTY</span><span className="count">{players.length}/8</span></div><div className="player-list">{players.map((player, index) => <div className="player-row" key={player.id}><div className={'avatar avatar-' + (index % 6)}>{player.name.slice(0, 1).toUpperCase()}</div><div className="player-meta"><strong>{player.name}{player.id === playerId ? ' (you)' : ''}</strong><small>{player.id === game?.drawerId ? '✏️ Artist' : 'Ready to guess'}</small></div><span className="player-score">{player.score}<small>pts</small></span>{index === 0 && <Crown className="crown" size={14} />}</div>)}</div><div className="invite-box"><div className="invite-icon"><Link2 size={16} /></div><div><strong>Bring your people</strong><small>Share the room link to invite</small></div><button onClick={copyInvite}>{copied ? 'Copied!' : 'Invite'}</button></div><div className="score-note"><Trophy size={15} /> First to draw, first to brag.</div></aside>
        <section className="center-stage"><div className="round-bar"><div><span className="round-label">ROUND {game?.round || 0}</span><span className="round-sub">{game?.status === 'drawing' ? (drawer ? 'Your masterpiece awaits' : game.drawerName + ' is drawing') : 'Waiting for the artist'}</span></div><div className={'timer ' + (timeLeft < 15 ? 'urgent' : '')}><Timer size={16} /> {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}</div></div>
          <div className="word-banner">{game?.status === 'drawing' ? <><div><span className="word-caption">{drawer ? 'YOUR WORD' : 'GUESS THE WORD'}</span><strong>{drawer ? secretWord : game.hint}</strong></div><div className="word-length">{game.wordLength} letters</div></> : <><div><span className="word-caption">READY WHEN YOU ARE</span><strong>{game?.status === 'choosing' ? 'Pick your word!' : 'Waiting for the next round'}</strong></div>{isHost && <button className="small-primary" onClick={startRound}><Play size={14} /> Start round</button>}</>}</div>
          {game?.status === 'choosing' && drawer && <div className="word-choices">{wordChoices.map(word => <button key={word} onClick={() => chooseWord(word)}>{word}<ChevronRight size={15} /></button>)}</div>}
          <div className="canvas-wrap"><canvas ref={canvasRef} width={900} height={560} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} className={drawer && game?.status === 'drawing' ? 'canvas drawing' : 'canvas'} /><div className="canvas-stamp">✳ SKETCH PARTY</div>{(!game || game.status === 'ended') && <div className="canvas-empty"><div className="empty-icon"><Pencil size={24} /></div><strong>The canvas is all yours</strong><span>Start a round and let the doodles begin.</span>{isHost && <button className="primary-button compact" onClick={startRound}><Play size={15} /> Start first round</button>}</div>}{game?.status === 'choosing' && !drawer && <div className="canvas-overlay">The artist is choosing a word…</div>}</div>
          {drawer && game?.status === 'drawing' && <div className="draw-tools"><div className="tool-group"><button className={tool === 'pen' ? 'tool active' : 'tool'} onClick={() => setTool('pen')} title="Pen"><Pencil size={17} /></button><button className={tool === 'eraser' ? 'tool active' : 'tool'} onClick={() => setTool('eraser')} title="Eraser"><Eraser size={17} /></button><button className="tool" onClick={clearCanvas} title="Clear canvas"><X size={17} /></button></div><div className="palette">{COLORS.map(c => <button key={c} aria-label={'Color ' + c} className={'swatch ' + (color === c ? 'selected' : '')} style={{ background: c }} onClick={() => { setColor(c); setTool('pen') }} />)}</div><div className="brush-control"><span>SIZE</span><input type="range" min="2" max="18" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} /></div></div>}
        </section>
        <aside className="chat-panel panel"><div className="panel-heading"><span><MessageCircle size={14} /> PARTY CHAT</span><span className="live-tag">LIVE</span></div><div className="chat-feed">{chat.map(line => <div className={'chat-line ' + line.kind} key={line.id}>{line.kind === 'system' ? <span className="system-text">{line.text}</span> : <><strong>{line.name}</strong><span>{line.text}</span></>}</div>)}<div ref={chatEndRef} /></div><form className="chat-input" onSubmit={submitGuess}><input value={guess} onChange={e => setGuess(e.target.value)} placeholder={drawer ? 'You are drawing…' : 'Type your guess…'} disabled={drawer || !game || game.status !== 'drawing'} /><button disabled={drawer || !guess.trim() || !game || game.status !== 'drawing'} aria-label="Send guess"><Send size={16} /></button></form><div className="chat-hint"><Lightbulb size={13} /> {drawer ? 'Make it obvious. Or don’t.' : 'Close guesses count. Be quick!'}</div></aside>
      </div>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </main>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><section className="rules-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={18} /></button><div className="modal-icon"><Sparkles size={22} /></div><h2>How to play</h2><p>It's simple: one person draws, everyone else guesses. The worse the drawing, the better the party.</p><ol><li><strong>Start a room</strong><span>Share your room link with friends.</span></li><li><strong>Pick a word</strong><span>The artist chooses one of three mystery words.</span></li><li><strong>Draw & guess</strong><span>You have 80 seconds. No letters or numbers!</span></li><li><strong>Win points</strong><span>Guess quickly to score more points.</span></li></ol><button className="primary-button" onClick={onClose}>Let's play <ChevronRight size={17} /></button><small className="modal-footnote">Multiplayer rooms need Supabase configuration. Demo mode is available without it.</small></section></div>
}
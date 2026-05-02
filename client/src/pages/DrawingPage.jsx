import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

// ─── Canvas constants ────────────────────────────────────────────────────────
const CANVAS_W = 400;
const CANVAS_H = 300;

const COLORS = [
  '#000000', '#FFFFFF', '#EF4444', '#F97316', '#EAB308',
  '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#78350F',
];

const WIDTHS = [2, 6, 14];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getPos = (canvas, clientX, clientY) => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round((clientX - rect.left) * (CANVAS_W / rect.width)),
    y: Math.round((clientY - rect.top) * (CANVAS_H / rect.height)),
  };
};

const drawStroke = (ctx, stroke) => {
  if (!stroke.points || stroke.points.length === 0) return;
  ctx.beginPath();
  ctx.strokeStyle = stroke.type === 'eraser' ? '#FFFFFF' : stroke.color;
  ctx.fillStyle  = stroke.type === 'eraser' ? '#FFFFFF' : stroke.color;
  ctx.lineWidth  = stroke.width;
  ctx.lineCap    = 'round';
  ctx.lineJoin   = 'round';
  if (stroke.points.length === 1) {
    ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  ctx.stroke();
};

const redrawAll = (canvas, strokes) => {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  strokes.forEach(s => drawStroke(ctx, s));
};

// ─── ReplayCanvas (small preview) ───────────────────────────────────────────
const ReplayCanvas = ({ strokes = [], cssWidth = 180, cssHeight = 135, className = '' }) => {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    (strokes || []).forEach(s => drawStroke(ctx, s));
  }, [strokes]);
  return (
    <canvas
      ref={ref}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ width: cssWidth, height: cssHeight }}
      className={`block ${className}`}
    />
  );
};

// ─── Timer ring ──────────────────────────────────────────────────────────────
const TimerRing = ({ secondsLeft, total }) => {
  const r = 32;
  const circ = 2 * Math.PI * r;
  const progress = Math.max(0, secondsLeft / total);
  const offset = circ * (1 - progress);
  const color = secondsLeft <= 10 ? '#FF6B6B' : secondsLeft <= 25 ? '#FFE66D' : '#4ECDC4';
  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={r} fill="none" stroke="#2D2D44" strokeWidth="6" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 40 40)" style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }} />
      <text x="40" y="46" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold" fontFamily="Nunito">
        {secondsLeft}
      </text>
    </svg>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────
export default function DrawingPage() {
  const { state, dispatch } = useGame();
  const navigate = useNavigate();
  const { draw, isHost, roomCode, playerId, isPlaying, lang } = state;
  const t = translations[lang].draw;

  const sounds = useSounds();

  // Canvas refs — avoid re-rendering on every stroke
  const canvasRef   = useRef(null);
  const strokesRef  = useRef([]);
  const curStroke   = useRef(null);
  const isDrawing   = useRef(false);

  // Only tool state triggers re-renders
  const [tool,  setTool]  = useState('pen');
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(WIDTHS[1]);
  const [strokeCount, setStrokeCount] = useState(0); // proxy for undo button state

  // Redirect if not in a drawing game
  useEffect(() => {
    if (state.phase && state.phase !== 'drawing' && state.phase !== 'drawEnd' && draw.phase === 'waiting') {
      navigate('/lobby');
    }
  }, [state.phase, draw.phase, navigate]);

  // White canvas background on mount and new round
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    strokesRef.current = [];
    setStrokeCount(0);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }, [draw.round]);

  // ── Drawing event handlers (all phases of pointer/touch) ─────────────────
  const startDraw = useCallback((x, y) => {
    if (draw.hasSubmitted) return;
    sounds.draw();
    isDrawing.current = true;
    curStroke.current = { color, width, type: tool, points: [{ x, y }] };
    // Draw a dot immediately
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.fillStyle = tool === 'eraser' ? '#FFFFFF' : color;
      ctx.arc(x, y, width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [color, width, tool, draw.hasSubmitted]);

  const moveDraw = useCallback((x, y) => {
    if (!isDrawing.current || !curStroke.current) return;
    const pts = curStroke.current.points;
    pts.push({ x, y });
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.strokeStyle = curStroke.current.type === 'eraser' ? '#FFFFFF' : curStroke.current.color;
    ctx.lineWidth   = curStroke.current.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  }, []);

  const endDraw = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (curStroke.current && curStroke.current.points.length > 0) {
      strokesRef.current.push(curStroke.current);
      setStrokeCount(c => c + 1);
    }
    curStroke.current = null;
  }, []);

  // Mouse handlers
  const onMouseDown = (e) => {
    const pos = getPos(e.currentTarget, e.clientX, e.clientY);
    startDraw(pos.x, pos.y);
  };
  const onMouseMove = (e) => {
    if (!isDrawing.current) return;
    const pos = getPos(e.currentTarget, e.clientX, e.clientY);
    moveDraw(pos.x, pos.y);
  };
  const onMouseUp = () => endDraw();
  const onMouseLeave = () => endDraw();

  // Touch handlers
  const onTouchStart = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const pos = getPos(e.currentTarget, touch.clientX, touch.clientY);
    startDraw(pos.x, pos.y);
  };
  const onTouchMove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const pos = getPos(e.currentTarget, touch.clientX, touch.clientY);
    moveDraw(pos.x, pos.y);
  };
  const onTouchEnd = (e) => { e.preventDefault(); endDraw(); };

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleUndo = () => {
    strokesRef.current.pop();
    setStrokeCount(c => Math.max(0, c - 1));
    const canvas = canvasRef.current;
    if (canvas) redrawAll(canvas, strokesRef.current);
  };

  const handleClear = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
  };

  const handleSubmit = () => {
    if (draw.hasSubmitted || draw.phase !== 'drawing') return;
    socket.emit('draw:submit', { code: roomCode, strokes: strokesRef.current });
    dispatch({ type: 'DRAW_MARK_SUBMITTED' });
  };

  const handleVote = (votedForPlayerId) => {
    if (draw.hasVoted || votedForPlayerId === playerId) return;
    socket.emit('draw:vote', { code: roomCode, votedForPlayerId });
    dispatch({ type: 'DRAW_MARK_VOTED', payload: { votedForPlayerId } });
  };

  const handleSkipToVote = () => socket.emit('draw:skip_to_vote', { code: roomCode });
  const handleShowResults = () => socket.emit('draw:show_results', { code: roomCode });
  const handleNextRound = () => socket.emit('draw:next_round', { code: roomCode });
  const handleRestart = () => socket.emit('draw:restart', { code: roomCode });

  // Derived drawing-phase state
  const canSkip = draw.skipsUsed < draw.maxSkips && !draw.hasSubmitted;
  const skipsRemaining = draw.maxSkips - draw.skipsUsed;
  const displayWord = draw.yourWord || draw.word;

  // ── Render: Drawing phase ─────────────────────────────────────────────────
  if (draw.phase === 'drawing') {
    return (
      <motion.div className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-3 pb-4 select-none" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
        {/* Header */}
        <div className="flex items-center justify-between w-full max-w-md mb-2">
          <div>
            <p className="text-xs text-gray-400 font-['Nunito'] uppercase tracking-widest">
              {t.round} {draw.round} {t.of} {draw.totalRounds}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-['Nunito'] text-[#C39BD3] uppercase tracking-wider">
                {draw.mode === 'secret' ? (t.yourSecretWord || 'Your word:') : t.wordPrompt}
              </span>
              <span className="text-xl font-['Fredoka_One'] text-[#FFE66D] uppercase">{displayWord}</span>
            </div>
          </div>
          <TimerRing secondsLeft={draw.secondsLeft} total={draw.timeLimit} />
        </div>

        {/* Submission count */}
        <p className="text-xs text-gray-500 font-['Nunito'] mb-2">
          {draw.submittedCount || 0}/{draw.totalVoters || draw.players.length} {t.submitted}
        </p>

        {/* Canvas wrapper */}
        <div className="relative w-full max-w-md" style={{ aspectRatio: '4/3' }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="w-full h-full rounded-xl border-4 border-[#C39BD3] bg-white touch-none"
            style={{ cursor: tool === 'eraser' ? 'cell' : 'crosshair', display: 'block' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
          {draw.hasSubmitted && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl">
              <p className="text-white font-['Fredoka_One'] text-2xl text-center px-4">{t.waitingOthers}</p>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="w-full max-w-md mt-3 bg-[#1A1A2E] rounded-2xl p-3 space-y-3">
          {/* Colors */}
          <div className="flex gap-2 flex-wrap justify-center">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => { setTool('pen'); setColor(c); }}
                className="rounded-full border-4 transition-transform"
                style={{
                  width: 28, height: 28,
                  backgroundColor: c,
                  borderColor: color === c && tool === 'pen' ? '#FFE66D' : c === '#FFFFFF' ? '#555' : c,
                  transform: color === c && tool === 'pen' ? 'scale(1.25)' : 'scale(1)',
                  boxShadow: c === '#FFFFFF' ? '0 0 0 1px #555' : 'none',
                }}
              />
            ))}
          </div>

          {/* Widths + Eraser */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {WIDTHS.map(w => (
                <button
                  key={w}
                  onClick={() => { setTool('pen'); setWidth(w); }}
                  className="rounded-full bg-gray-700 flex items-center justify-center transition-all border-2"
                  style={{
                    width: w + 18, height: w + 18,
                    borderColor: width === w && tool === 'pen' ? '#FFE66D' : 'transparent',
                  }}
                >
                  <div className="rounded-full bg-white" style={{ width: w, height: w }} />
                </button>
              ))}
            </div>
            <button
              onClick={() => setTool('eraser')}
              className={`px-3 py-1.5 rounded-lg text-sm font-['Fredoka_One'] transition border-2 ${tool === 'eraser' ? 'bg-white text-black border-[#FFE66D]' : 'bg-[#2D2D44] text-white border-transparent'}`}
            >
              ✏️ Eraser
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleUndo}
              disabled={strokeCount === 0}
              className="flex-1 py-2 rounded-lg text-sm font-['Fredoka_One'] bg-[#2D2D44] text-white disabled:opacity-40 hover:bg-[#3D3D54] transition"
            >
              ↩ {t.undo}
            </button>
            <button
              onClick={handleClear}
              disabled={strokeCount === 0}
              className="flex-1 py-2 rounded-lg text-sm font-['Fredoka_One'] bg-[#2D2D44] text-white disabled:opacity-40 hover:bg-[#3D3D54] transition"
            >
              🗑 {t.clear}
            </button>
            <button
              onClick={handleSubmit}
              disabled={draw.hasSubmitted}
              className="flex-2 flex-grow py-2 rounded-lg text-sm font-['Fredoka_One'] bg-[#C39BD3] text-black disabled:opacity-40 hover:bg-[#b089c2] transition font-bold"
            >
              ✓ {t.submitBtn}
            </button>
          </div>

          {/* Skip word */}
          {canSkip && (
            <button
              onClick={() => socket.emit('draw:skip_word', { code: roomCode })}
              className="w-full py-2 rounded-lg text-xs font-['Nunito'] text-[#C39BD3] border border-[#C39BD3]/40 hover:border-[#C39BD3] hover:bg-[#C39BD3]/10 transition"
            >
              🔀 {t.skipWord || 'Skip word'} · {skipsRemaining} {t.skipsLeft || 'left'}
            </button>
          )}
          {!canSkip && draw.skipsUsed >= draw.maxSkips && !draw.hasSubmitted && (
            <p className="text-center text-xs text-gray-600 font-['Nunito']">{t.noSkipsLeft || 'No skips left'}</p>
          )}

          {/* Host controls */}
          {isHost && (
            <button
              onClick={handleSkipToVote}
              className="w-full py-2 rounded-lg text-xs font-['Nunito'] text-gray-400 border border-gray-600 hover:border-gray-400 transition"
            >
              {t.skipToVote} →
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  // ── Render: Voting phase ───────────────────────────────────────────────
  if (draw.phase === 'voting') {
    const subs = draw.submissions || [];
    const isSecretMode = draw.mode === 'secret';
    return (
      <motion.div className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-4" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
        <h2 className="text-2xl font-['Fredoka_One'] text-[#FFE66D] mb-1">{t.voting}</h2>
        {!isSecretMode ? (
          <p className="text-sm text-gray-400 font-['Nunito'] mb-1">
            {t.wordWas} <span className="text-[#C39BD3] font-bold uppercase">{draw.wordResult}</span>
          </p>
        ) : (
          <p className="text-sm text-[#C39BD3] font-['Nunito'] mb-1">✦ {t.secretMode || 'Secret Words'} — {t.secretVotingHint || 'each drawing had a different word!'}</p>
        )}
        <p className="text-xs text-gray-500 font-['Nunito'] mb-4">
          {draw.voteCount || 0}/{draw.totalVoters || subs.length} voted
        </p>

        <div className="grid grid-cols-2 gap-3 w-full max-w-md mb-4">
          {subs.map(sub => {
            const isOwn = sub.playerId === playerId;
            const voted = draw.votedForPlayerId === sub.playerId;
            const canVote = !draw.hasVoted && !isOwn;
            return (
              <button
                key={sub.playerId}
                onClick={() => canVote && handleVote(sub.playerId)}
                disabled={draw.hasVoted || isOwn}
                className={`rounded-2xl overflow-hidden border-4 transition-all ${
                  voted ? 'border-[#FFE66D] shadow-[0_0_12px_#FFE66D80]' :
                  isOwn ? 'border-[#2D2D44] opacity-60' :
                  canVote ? 'border-[#2D2D44] hover:border-[#C39BD3] hover:shadow-[0_0_10px_#C39BD380] cursor-pointer' :
                  'border-[#2D2D44]'
                }`}
              >
                <ReplayCanvas strokes={sub.strokes} cssWidth="100%" cssHeight={130} className="w-full" />
                <div className="bg-[#1A1A2E] py-2 px-2">
                  {isSecretMode && sub.word && (
                    <p className="text-[10px] font-['Fredoka_One'] text-[#FFE66D] uppercase text-center mb-1 truncate">{sub.word}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: sub.color }} />
                      <span className="text-xs font-['Nunito'] text-gray-300 truncate max-w-[60px]">
                        {isOwn ? `${t.yourCaption}` : '???'}
                      </span>
                    </div>
                    {canVote && <span className="text-xs font-['Fredoka_One'] text-[#C39BD3]">{t.voteBtn}</span>}
                    {voted && <span className="text-xs text-[#FFE66D]">✓</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {isHost && (
          <button
            onClick={handleShowResults}
            className="w-full max-w-md py-3 rounded-xl bg-[#C39BD3] text-black font-['Fredoka_One'] text-lg hover:bg-[#b089c2] transition"
          >
            {t.showResults}
          </button>
        )}
      </motion.div>
    );
  }

  // ── Render: Results phase ─────────────────────────────────────────────────
  if (draw.phase === 'results') {
    const results = draw.results || [];
    const isLastRound = draw.round >= draw.totalRounds;
    const isSecretResults = draw.mode === 'secret';
    return (
      <motion.div className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-4 pb-28" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
        <h2 className="text-2xl font-['Fredoka_One'] text-[#FFE66D] mb-1">{t.results}</h2>
        {!isSecretResults ? (
          <p className="text-sm text-gray-400 font-['Nunito'] mb-1">
            {t.wordWas} <span className="text-[#C39BD3] font-bold uppercase">{draw.wordResult}</span>
          </p>
        ) : (
          <p className="text-sm text-[#C39BD3] font-['Nunito'] mb-1">✦ {t.secretMode || 'Secret Words'}</p>
        )}
        <p className="text-xs text-gray-500 font-['Nunito'] mb-4">
          {t.round} {draw.round} {t.of} {draw.totalRounds}
        </p>

        <div className="w-full max-w-md space-y-3 mb-6">
          {results.map((r, i) => {
            const delta = draw.roundScores?.[r.playerId] || 0;
            const medals = ['🥇', '🥈', '🥉'];
            return (
              <div key={r.playerId} className="bg-[#1A1A2E] rounded-2xl overflow-hidden flex border border-[#2D2D44]">
                <div className="flex-shrink-0 bg-[#0D0D1A] p-2 flex items-center justify-center" style={{ width: 90 }}>
                  <ReplayCanvas strokes={r.strokes} cssWidth={86} cssHeight={64} />
                </div>
                <div className="flex-1 p-3 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{medals[i] || `#${i + 1}`}</span>
                    <div className="w-4 h-4 rounded-full border border-white/20 flex-shrink-0" style={{ backgroundColor: r.color }} />
                    <span className="font-['Fredoka_One'] text-white">{r.name}</span>
                  </div>
                  {isSecretResults && r.word && (
                    <p className="text-xs text-[#FFE66D] font-['Nunito'] mb-1">"{r.word}"</p>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 font-['Nunito']">{r.votes} {t.votesLabel}</span>
                    {delta > 0 && <span className="text-xs font-bold text-[#4ECDC4]">+{delta} {t.pts}</span>}
                    {delta === 0 && i === 0 && r.votes === 0 && <span className="text-xs text-gray-600">—</span>}
                  </div>
                </div>
                {r.playerId === playerId && (
                  <div className="flex items-center pr-3">
                    <span className="text-xs text-[#C39BD3] font-['Nunito']">you</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Leaderboard snapshot */}
        <div className="w-full max-w-md bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-4 mb-4">
          <h3 className="text-sm font-['Fredoka_One'] text-gray-400 uppercase tracking-widest mb-3">Scores</h3>
          {(draw.leaderboard || []).map((p, i) => (
            <div key={p.id} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-4">{i + 1}</span>
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="font-['Nunito'] text-white text-sm">{p.name}</span>
              </div>
              <span className="font-['Fredoka_One'] text-[#FFE66D]">{p.score} {t.pts}</span>
            </div>
          ))}
        </div>

        {isHost && (
          <div className="fixed bottom-0 w-full max-w-md px-4 py-4 bg-[#1A1A2E] border-t border-[#2D2D44] flex gap-3">
            <button
              onClick={handleNextRound}
              className="flex-1 py-3 rounded-xl font-['Fredoka_One'] text-lg bg-[#C39BD3] text-black hover:bg-[#b089c2] transition"
            >
              {isLastRound ? t.endGame : t.nextRound + ' →'}
            </button>
          </div>
        )}
        {!isHost && (
          <p className="text-[#C39BD3] font-['Fredoka_One'] text-lg animate-pulse mt-4">
            {isLastRound ? 'Waiting for host...' : 'Waiting for next round...'}
          </p>
        )}
      </motion.div>
    );
  }

  // Fallback while transitioning
  return (
    <motion.div className="flex items-center justify-center min-h-screen bg-[#0D0D1A]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <p className="text-white font-['Fredoka_One'] text-2xl animate-pulse">🎨 Loading...</p>
    </motion.div>
  );
}

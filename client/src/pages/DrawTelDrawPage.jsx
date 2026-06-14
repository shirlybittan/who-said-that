import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import { CANVAS_W, CANVAS_H, redrawCanvas, redrawOverlay, drawStroke } from '../utils/canvasUtils';
import TimerRing from '../components/game/TimerRing';
import GamePageWrapper from '../components/GamePageWrapper.jsx';

const COLORS = [
  '#000000', '#FFFFFF', '#EF4444', '#F97316', '#EAB308',
  '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#78350F',
];
const WIDTHS = [2, 6, 14];

const getPos = (canvas, clientX, clientY) => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round((clientX - rect.left) * (canvas.width  / rect.width)),
    y: Math.round((clientY - rect.top)  * (canvas.height / rect.height)),
  };
};

export default function DrawTelDrawPage() {
  const { state, dispatch } = useGame();
  const { dt, roomCode } = state;
  const turn = dt.currentTurn;
  const selfieData = turn?.originalSelfieData || null;
  const sounds = useSounds();
  const navigate = useNavigate();

  useEffect(() => {
    if (!turn) navigate('/draw-tel-wait', { replace: true });
  }, [turn, navigate]);

  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const curStroke = useRef(null);
  const isDrawing = useRef(false);

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(WIDTHS[1]);
  const [strokeCount, setStrokeCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  // Redraws canvas after undo/clear, respecting selfie background
  const redrawAll = useCallback((strokes) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (selfieData) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokes.forEach(s => drawStroke(ctx, s));
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      strokes.forEach(s => drawStroke(ctx, s));
    }
  }, [selfieData]);

  // Load existing strokes when turn changes
  useEffect(() => {
    strokesRef.current = [];
    setStrokeCount(0);
    setSubmitted(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (selfieData) {
      redrawOverlay(canvas, turn?.existingStrokes || []);
    } else {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (turn?.existingStrokes?.length) {
        redrawCanvas(canvas, turn.existingStrokes);
      }
    }
  }, [turn?.promptId]);

  const startDraw = useCallback((x, y) => {
    if (submitted) return;
    sounds.draw?.();
    isDrawing.current = true;
    curStroke.current = { color, width, type: tool, points: [{ x, y }] };
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.save();
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.fillStyle = color;
      }
      ctx.beginPath();
      ctx.arc(x, y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }, [color, width, tool, submitted, sounds]);

  const moveDraw = useCallback((x, y) => {
    if (!isDrawing.current || !curStroke.current) return;
    const pts = curStroke.current.points;
    pts.push({ x, y });
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      if (curStroke.current.type === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = curStroke.current.color;
      }
      ctx.lineWidth = curStroke.current.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
      ctx.restore();
    }
  }, [color, width, tool]);

  const endDraw = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (curStroke.current && curStroke.current.points.length > 1) {
      strokesRef.current.push(curStroke.current);
      setStrokeCount(strokesRef.current.length);
    }
    curStroke.current = null;
  }, []);

  const handleUndo = useCallback(() => {
    if (strokesRef.current.length > 0) {
      sounds.undo?.();
      strokesRef.current.pop();
      setStrokeCount(strokesRef.current.length);
      const existing = turn?.existingStrokes || [];
      redrawAll([...existing, ...strokesRef.current]);
    }
  }, [redrawAll, sounds, turn?.existingStrokes]);

  const handleClear = useCallback(() => {
    if (strokesRef.current.length > 0) {
      sounds.clear?.();
      strokesRef.current = [];
      setStrokeCount(0);
      const existing = turn?.existingStrokes || [];
      redrawAll([...existing]);
    }
  }, [redrawAll, sounds, turn?.existingStrokes]);

  const handleSubmit = useCallback(() => {
    if (submitted || strokesRef.current.length === 0) return;
    sounds.answer?.();
    socket.emit('dt:submit_strokes', {
      code: roomCode,
      promptId: turn.promptId,
      strokes: strokesRef.current,
    });
    dispatch({ type: 'DT_MARK_TURN_SUBMITTED' });
    setSubmitted(true);
    // Stay on this page — show submitted overlay; next dt:your_turn will reset
  }, [submitted, roomCode, turn?.promptId, sounds, dispatch]);

  // Auto-submit at ≤1 second (belt-and-suspenders alongside dt:time_up)
  useEffect(() => {
    if (!submitted && turn && dt.currentTurn?.secondsLeft <= 1) {
      socket.emit('dt:submit_strokes', { code: roomCode, promptId: turn.promptId, strokes: strokesRef.current });
      dispatch({ type: 'DT_MARK_TURN_SUBMITTED' });
      setSubmitted(true);
    }
  }, [dt.currentTurn?.secondsLeft, submitted, turn, roomCode, dispatch]);

  // Force-submit when server says time is up
  useEffect(() => {
    const onTimeUp = ({ promptId }) => {
      if (!submitted && turn?.promptId === promptId) {
        socket.emit('dt:submit_strokes', { code: roomCode, promptId, strokes: strokesRef.current });
        dispatch({ type: 'DT_MARK_TURN_SUBMITTED' });
        setSubmitted(true);
      }
    };
    socket.on('dt:time_up', onTimeUp);
    return () => socket.off('dt:time_up', onTimeUp);
  }, [submitted, turn, roomCode, dispatch]);

  // Note: dt:your_turn is handled globally in useSocket.js (dispatches DT_YOUR_TURN + navigates here).
  // Canvas reset happens in the turn?.promptId effect above when the new turn arrives.

  // ── Fullscreen ───────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => {
        setIsFullscreen(true);
        if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
      }).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Touch handlers
  const onTouchStart = (e) => {
    e.preventDefault();
    const { x, y } = getPos(canvasRef.current, e.touches[0].clientX, e.touches[0].clientY);
    startDraw(x, y);
  };
  const onTouchMove = (e) => {
    e.preventDefault();
    const { x, y } = getPos(canvasRef.current, e.touches[0].clientX, e.touches[0].clientY);
    moveDraw(x, y);
  };

  // Mouse handlers
  const onMouseDown = (e) => {
    const { x, y } = getPos(canvasRef.current, e.clientX, e.clientY);
    startDraw(x, y);
  };
  const onMouseMove = (e) => {
    const { x, y } = getPos(canvasRef.current, e.clientX, e.clientY);
    moveDraw(x, y);
  };

  return (
    <GamePageWrapper>
      <motion.div
        className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="w-full max-w-4xl mx-auto flex flex-col lg:flex-row gap-4">
          {/* Left: Prompt + Info */}
          <div className="flex-1 flex flex-col gap-3">
            <div className="bg-[#1A1A2E] rounded-2xl p-4 border border-[#FF6B6B]/30">
              {/* Timer row */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-gray-400 font-['Nunito'] uppercase tracking-widest mb-1">
                    Step {turn?.position || 1} of {turn?.totalPositions || 1}
                  </p>
                  <p className="text-lg text-white font-['Nunito']">
                    {turn?.position > 1 ? "Draw over the previous drawing!" : "Draw this prompt!"}
                  </p>
                </div>
                <TimerRing secondsLeft={turn?.secondsLeft ?? 0} total={60} size={52} />
              </div>

              {/* Previous step content */}
              <div className="bg-[#1A1A2E] rounded-2xl p-4 border border-[#FF6B6B]/30 flex-1">
                <p className="text-xs text-gray-400 font-['Nunito'] uppercase tracking-widest mb-2">
                  {turn?.position > 1 ? "Previous Drawing" : "Your Prompt"}
                </p>
                {turn?.position > 1 ? (
                  <>
                    <p className="text-sm font-['Fredoka_One'] text-[#FFE66D] text-center mb-2">
                      "{turn?.finalText}"
                    </p>
                  <div className="bg-[#000] rounded-xl overflow-hidden relative" style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}>
                    {selfieData && <img src={selfieData} alt="" className="absolute inset-0 w-full h-full object-contain bg-[#111827]" />}
                    <canvas
                      ref={r => {
                        if (r) {
                          if (selfieData) redrawOverlay(r, turn.existingStrokes || []);
                          else redrawCanvas(r, turn.existingStrokes || []);
                        }
                      }}
                      width={CANVAS_W}
                      height={CANVAS_H}
                      className="w-full h-auto absolute inset-0"
                    />
                  </div>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-2">
                    <p className="text-3xl font-['Fredoka_One'] text-[#FFE66D] text-center mb-4">
                      "{turn?.finalText}"
                    </p>
                    {selfieData && (
                      <img src={selfieData} className="w-24 h-24 object-cover rounded-full border-2 border-[#FF6B6B] shadow-lg shadow-[#FF6B6B]/20" alt="Selfie bg" />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Canvas + Controls */}
          <div className="lg:w-[420px] flex flex-col gap-3">
            <div
              ref={containerRef}
              className={isFullscreen
                ? 'fixed inset-0 z-50 bg-[#0D0D1A] flex flex-col items-center justify-center'
                : 'relative flex flex-col gap-3'}
            >
            <div className={`relative w-full ${isFullscreen ? 'flex-1 flex items-center justify-center' : ''}`}
              style={isFullscreen ? {} : { aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
            >
              {/* Selfie photo behind the canvas */}
              {selfieData && (
                <img
                  src={selfieData}
                  className="absolute inset-0 w-full h-full object-contain rounded-2xl pointer-events-none bg-[#111827]"
                  alt="selfie background"
                />
              )}
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className={`absolute inset-0 w-full h-full rounded-2xl ${selfieData ? 'bg-transparent' : 'bg-white'}`}
                style={{ touchAction: 'none' }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={endDraw}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
              />
              {submitted && (
                <div className="absolute inset-0 bg-black/70 rounded-2xl flex flex-col items-center justify-center gap-2">
                  <p className="text-3xl">✅</p>
                  <p className="text-white font-['Fredoka_One'] text-xl">Drawing Submitted!</p>
                  <p className="text-gray-400 font-['Nunito'] text-sm">Waiting for others...</p>
                </div>
              )}
              {/* Fullscreen toggle */}
              <button
                onClick={toggleFullscreen}
                className="absolute top-2 left-2 z-10 bg-black/60 hover:bg-black/80 text-white rounded-lg px-2 py-1 text-base leading-none transition"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? '⤡' : '⤢'}
              </button>
            </div>

            {/* Toolbar */}
            <div className={`bg-[#1A1A2E] rounded-2xl p-3 border border-[#2D2D44] flex flex-col gap-2 ${isFullscreen ? 'absolute bottom-0 left-0 right-0 rounded-none rounded-t-2xl bg-[#1A1A2E]/95 backdrop-blur-sm' : ''}`}>
              {/* Colors */}
              <div className="flex justify-between">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => {
                      setTool('pen');
                      setColor(c);
                    }}
                    className={`w-7 h-7 rounded-full border-2 transition ${
                      tool === 'pen' && color === c ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <button
                  onClick={() => setTool('eraser')}
                  className={`w-7 h-7 rounded-full border-2 transition flex items-center justify-center ${
                    tool === 'eraser' ? 'border-white scale-110 bg-gray-400' : 'border-transparent bg-gray-600'
                  }`}
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              {/* Widths */}
              <div className="flex items-center gap-3 bg-[#0D0D1A] rounded-lg p-2">
                {WIDTHS.map(w => (
                  <button
                    key={w}
                    onClick={() => setWidth(w)}
                    className={`flex-1 h-8 rounded-md flex items-center justify-center transition ${
                      width === w ? 'bg-[#FF6B6B]' : 'bg-[#2D2D44] hover:bg-gray-600'
                    }`}
                  >
                    <div className="bg-white rounded-full" style={{ width: w, height: w }} />
                  </button>
                ))}
              </div>
              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleUndo}
                  disabled={strokeCount === 0 || submitted}
                  className="flex-1 py-2 rounded-lg bg-[#2D2D44] text-white font-['Nunito'] disabled:opacity-50"
                >
                  Undo
                </button>
                <button
                  onClick={handleClear}
                  disabled={strokeCount === 0 || submitted}
                  className="flex-1 py-2 rounded-lg bg-[#2D2D44] text-white font-['Nunito'] disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitted || strokeCount === 0}
              className={`w-full py-3 rounded-2xl bg-[#FF6B6B] text-white font-['Fredoka_One'] text-xl disabled:bg-gray-600 ${isFullscreen ? 'hidden' : ''}`}
            >
              {submitted ? 'Submitted!' : 'Submit Drawing'}
            </button>
            </div>{/* end fullscreen container */}
          </div>
        </div>
      </motion.div>
    </GamePageWrapper>
  );
}

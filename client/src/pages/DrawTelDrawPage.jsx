import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import { CANVAS_W, CANVAS_H, redrawCanvas, redrawOverlay, drawStroke } from '../utils/canvasUtils';
import TimerRing from '../components/game/TimerRing';

const COLORS = [
  '#000000', '#FFFFFF', '#EF4444', '#F97316', '#EAB308',
  '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#78350F',
];
const WIDTHS = [2, 6, 14];

const getPos = (canvas, clientX, clientY) => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round((clientX - rect.left) * (CANVAS_W / rect.width)),
    y: Math.round((clientY - rect.top) * (CANVAS_H / rect.height)),
  };
};

export default function DrawTelDrawPage() {
  const { state, dispatch } = useGame();
  const { dt, roomCode } = state;
  const turn = dt.currentTurn;
  const selfieData = turn?.originalSelfieData || null;
  const sounds = useSounds();

  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const curStroke = useRef(null);
  const isDrawing = useRef(false);

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(WIDTHS[1]);
  const [strokeCount, setStrokeCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // Redraws canvas after undo/clear, respecting selfie background
  const redrawAll = useCallback((strokes) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (selfieData) {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      strokes.forEach(s => drawStroke(ctx, s));
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
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
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
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
    if (!canvas) return;
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
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  const endDraw = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (curStroke.current?.points.length > 0) {
      strokesRef.current.push(curStroke.current);
      setStrokeCount(c => c + 1);
    }
    curStroke.current = null;
  }, []);

  const handleUndo = () => {
    strokesRef.current.pop();
    setStrokeCount(c => Math.max(0, c - 1));
    redrawAll([...(turn?.existingStrokes || []), ...strokesRef.current]);
  };

  const handleClear = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    redrawAll(turn?.existingStrokes || []);
  };

  const handleSubmit = () => {
    if (submitted || !turn) return;
    socket.emit('dt:submit_strokes', {
      code: roomCode,
      promptId: turn.promptId,
      strokes: strokesRef.current,
    });
    dispatch({ type: 'DT_MARK_TURN_SUBMITTED' });
    setSubmitted(true);
  };

  // Auto-submit at ≤1 second (belt-and-suspenders alongside dt:time_up)
  useEffect(() => {
    if (!submitted && turn && dt.currentTurn?.secondsLeft <= 1) {
      socket.emit('dt:submit_strokes', { code: roomCode, promptId: turn.promptId, strokes: strokesRef.current });
      dispatch({ type: 'DT_MARK_TURN_SUBMITTED' });
      setSubmitted(true);
    }
  }, [dt.currentTurn?.secondsLeft, submitted, turn, roomCode, dispatch]);

  // Force-submit when server says time is up (ensures actual strokes reach server before fallback)
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

  // Mouse handlers
  const onMouseDown = (e) => { const pos = getPos(e.currentTarget, e.clientX, e.clientY); startDraw(pos.x, pos.y); };
  const onMouseMove = (e) => { if (!isDrawing.current) return; const pos = getPos(e.currentTarget, e.clientX, e.clientY); moveDraw(pos.x, pos.y); };
  const onMouseUp = () => endDraw();
  const onMouseLeave = () => endDraw();

  // Touch handlers
  const onTouchStart = (e) => { e.preventDefault(); const t = e.touches[0]; const pos = getPos(e.currentTarget, t.clientX, t.clientY); startDraw(pos.x, pos.y); };
  const onTouchMove = (e) => { e.preventDefault(); const t = e.touches[0]; const pos = getPos(e.currentTarget, t.clientX, t.clientY); moveDraw(pos.x, pos.y); };
  const onTouchEnd = (e) => { e.preventDefault(); endDraw(); };

  if (!turn) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      >
        <p className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mb-2">Waiting for your turn…</p>
        <p className="text-gray-400 font-['Nunito'] text-sm">
          {dt.chainsCompletedCount}/{dt.totalChains} chains complete
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-3 pb-4 select-none"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-md mb-2">
        <div>
          <p className="text-xs text-gray-400 font-['Nunito'] uppercase tracking-widest">
            📞 Draw Telephone — step {turn.position} of {turn.totalPositions}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-['Nunito'] text-[#FF6B6B] uppercase tracking-wider">Draw:</span>
            <span className="text-lg font-['Fredoka_One'] text-[#FFE66D]">{turn.finalText}</span>
          </div>
        </div>
        <TimerRing secondsLeft={turn.secondsLeft} total={45} />
      </div>

      {/* Canvas */}
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border-4 border-[#FF6B6B]" style={{ aspectRatio: '4/3', backgroundColor: selfieData ? 'transparent' : '#FFFFFF' }}>
        {selfieData && (
          <img
            src={selfieData}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        )}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute inset-0 w-full h-full touch-none"
          style={{ cursor: tool === 'eraser' ? 'cell' : 'crosshair', display: 'block' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
        {submitted && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl">
            <p className="text-white font-['Fredoka_One'] text-2xl text-center px-4">Submitted! Waiting…</p>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="w-full max-w-md mt-3 bg-[#1A1A2E] rounded-2xl p-3 space-y-3">
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {WIDTHS.map(w => (
              <button
                key={w}
                onClick={() => { setTool('pen'); setWidth(w); }}
                className="rounded-full bg-gray-700 flex items-center justify-center border-2 transition-all"
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
            onClick={() => setTool(t => t === 'eraser' ? 'pen' : 'eraser')}
            className="px-3 py-1.5 rounded-lg text-sm font-['Nunito'] border-2 transition"
            style={{ borderColor: tool === 'eraser' ? '#FFE66D' : '#2D2D44', color: tool === 'eraser' ? '#FFE66D' : '#9CA3AF' }}
          >
            Eraser
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleUndo}
            disabled={strokeCount === 0}
            className="flex-1 py-2 rounded-xl text-sm font-['Nunito'] bg-[#2D2D44] text-gray-300 disabled:opacity-30 hover:bg-[#3D3D54] transition"
          >
            Undo
          </button>
          <button
            onClick={handleClear}
            className="flex-1 py-2 rounded-xl text-sm font-['Nunito'] bg-[#2D2D44] text-gray-300 hover:bg-[#3D3D54] transition"
          >
            Clear
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitted}
            className="flex-1 py-2 rounded-xl text-sm font-['Fredoka_One'] bg-[#FF6B6B] text-white disabled:opacity-40 hover:bg-[#ff5252] transition"
          >
            {submitted ? 'Done ✓' : 'Submit'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

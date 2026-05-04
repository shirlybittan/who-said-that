import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

const CANVAS_W = 400;
const CANVAS_H = 300;

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

const drawStroke = (ctx, stroke) => {
  if (!stroke.points || stroke.points.length === 0) return;
  ctx.beginPath();
  ctx.strokeStyle = stroke.type === 'eraser' ? 'rgba(0,0,0,0)' : stroke.color;
  ctx.fillStyle = stroke.type === 'eraser' ? 'rgba(0,0,0,0)' : stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (stroke.type === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
  }
  if (stroke.points.length === 1) {
    ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
};

const redrawOverlay = (canvas, strokes) => {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  strokes.forEach(s => drawStroke(ctx, s));
};

export default function SelfieDrawPage() {
  const { state, dispatch } = useGame();
  const selfie = state.selfie;
  const sounds = useSounds();

  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const curStroke = useRef(null);
  const isDrawing = useRef(false);

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#EF4444');
  const [width, setWidth] = useState(WIDTHS[1]);
  const [strokeCount, setStrokeCount] = useState(0);

  // Ensure canvas is transparent to show photo underneath
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  }, []);

  const getEventPos = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const touch = e.touches?.[0];
    return getPos(canvas, touch ? touch.clientX : e.clientX, touch ? touch.clientY : e.clientY);
  }, []);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    if (selfie.hasSubmittedDrawing) return;
    isDrawing.current = true;
    const pt = getEventPos(e);
    curStroke.current = { color, width, type: tool, points: [pt] };
  }, [color, width, tool, selfie.hasSubmittedDrawing, getEventPos]);

  const onPointerMove = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing.current || !curStroke.current) return;
    const pt = getEventPos(e);
    curStroke.current.points.push(pt);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    drawStroke(ctx, curStroke.current);
  }, [getEventPos]);

  const onPointerUp = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing.current || !curStroke.current) return;
    isDrawing.current = false;
    if (curStroke.current.points.length > 0) {
      strokesRef.current.push({ ...curStroke.current, points: [...curStroke.current.points] });
      setStrokeCount(strokesRef.current.length);
    }
    curStroke.current = null;
  }, []);

  const handleUndo = () => {
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    redrawOverlay(canvasRef.current, strokesRef.current);
  };

  const handleClear = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    redrawOverlay(canvasRef.current, strokesRef.current);
  };

  const handleSubmit = () => {
    if (selfie.hasSubmittedDrawing) return;
    sounds.answer?.();
    socket.emit('selfie:submit_drawing', { code: state.roomCode, strokes: strokesRef.current });
    dispatch({ type: 'SELFIE_MARK_DRAWING_SUBMITTED' });
  };

  const handleSkip = () => {
    sounds.click?.();
    socket.emit('selfie:skip_to_vote', { code: state.roomCode });
  };

  if (!selfie.assignedPhotoData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0D0D1A] text-gray-400 font-['Nunito']">
        Waiting for photo assignment…
      </div>
    );
  }

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-4"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <h1 className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mt-4 mb-1">🎨 Draw on {selfie.assignedOwnerName}'s selfie!</h1>
      {selfie.assignedPrompt ? (
        <div className="w-full max-w-sm bg-[#FFE66D]/10 border border-[#FFE66D]/40 rounded-xl px-4 py-2 mb-3 text-center">
          <p className="text-[#FFE66D] font-['Fredoka_One'] text-base">{selfie.assignedPrompt}</p>
        </div>
      ) : (
        <p className="text-gray-400 font-['Nunito'] text-xs mb-3">Draw on their selfie</p>
      )}

      {/* Photo + canvas overlay */}
      <div
        className="relative rounded-2xl overflow-hidden border-2 border-[#2D2D44] mb-3"
        style={{ width: '100%', maxWidth: CANVAS_W, aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
      >
        <img
          src={selfie.assignedPhotoData}
          alt={`${selfie.assignedOwnerName}'s selfie`}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none', cursor: selfie.hasSubmittedDrawing ? 'default' : 'crosshair' }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
        />
      </div>

      {!selfie.hasSubmittedDrawing ? (
        <>
          {/* Color palette */}
          <div className="flex flex-wrap justify-center gap-2 mb-2">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => { setColor(c); setTool('pen'); }}
                className={`w-8 h-8 rounded-full border-2 transition ${color === c && tool === 'pen' ? 'border-white scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c, boxShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
              />
            ))}
            {/* Eraser */}
            <button
              onClick={() => setTool('eraser')}
              className={`w-8 h-8 rounded-full border-2 bg-[#1A1A2E] flex items-center justify-center text-sm transition ${tool === 'eraser' ? 'border-white scale-110' : 'border-[#2D2D44]'}`}
            >
              ✕
            </button>
          </div>

          {/* Width selector */}
          <div className="flex gap-3 mb-3 items-center">
            {WIDTHS.map(w => (
              <button
                key={w}
                onClick={() => setWidth(w)}
                className={`rounded-full bg-white flex-shrink-0 transition ${width === w ? 'ring-2 ring-[#4ECDC4] scale-110' : ''}`}
                style={{ width: w + 10, height: w + 10 }}
              />
            ))}
          </div>

          <div className="flex gap-3 mb-3">
            {strokeCount > 0 && (
              <button
                onClick={handleUndo}
                className="bg-[#2D2D44] text-white px-4 py-2 rounded-xl font-['Nunito'] text-sm hover:bg-[#3D3D54] transition"
              >
                ↩ Undo
              </button>
            )}
            {strokeCount > 0 && (
              <button
                onClick={handleClear}
                className="bg-[#2D2D44] text-white px-4 py-2 rounded-xl font-['Nunito'] text-sm hover:bg-[#3D3D54] transition"
              >
                🗑 Clear
              </button>
            )}
          </div>

          <button
            onClick={handleSubmit}
            className="w-full max-w-xs bg-[#FF6B6B] text-white font-['Fredoka_One'] text-lg py-3 rounded-xl hover:bg-[#e05a5a] transition"
          >
            Submit Drawing ✓
          </button>
        </>
      ) : (
        <div className="w-full max-w-xs bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-5 text-center">
          <p className="text-[#4ECDC4] font-['Fredoka_One'] text-xl mb-2">Drawing submitted! ✓</p>
          <p className="text-gray-400 font-['Nunito'] text-sm">
            Waiting for others… ({selfie.drawingCount}/{selfie.totalDrawers})
          </p>
        </div>
      )}

      {state.isHost && selfie.hasSubmittedDrawing && (
        <button
          onClick={handleSkip}
          className="mt-4 text-sm text-gray-400 underline font-['Nunito'] hover:text-white transition"
        >
          Skip to voting
        </button>
      )}

      {/* Progress dots */}
      {selfie.totalDrawers > 0 && (
        <div className="mt-4 flex gap-2">
          {Array.from({ length: selfie.totalDrawers }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${i < selfie.drawingCount ? 'bg-[#FF6B6B]' : 'bg-[#2D2D44]'}`}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import { CANVAS_W, CANVAS_H, drawStroke, redrawOverlay } from '../utils/canvasUtils';
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

  // When the host changes the prompt mid-round, clear existing strokes and let player re-draw
  const prevPromptRef = useRef(selfie.assignedPrompt);
  useEffect(() => {
    if (prevPromptRef.current !== null && prevPromptRef.current !== selfie.assignedPrompt && selfie.assignedPrompt !== null) {
      strokesRef.current = [];
      setStrokeCount(0);
      if (canvasRef.current) redrawOverlay(canvasRef.current, []);
    }
    prevPromptRef.current = selfie.assignedPrompt;
  }, [selfie.assignedPrompt]);

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
    sounds.answer?.();
    socket.emit('selfie:submit_drawing', { code: state.roomCode, strokes: strokesRef.current });
    dispatch({ type: 'SELFIE_MARK_DRAWING_SUBMITTED' });
  };

  // Auto-submit when host signals the drawing phase is ending (skip to vote)
  useEffect(() => {
    const onDrawingEnding = () => {
      if (!selfie.hasSubmittedDrawing) {
        socket.emit('selfie:submit_drawing', { code: state.roomCode, strokes: strokesRef.current });
        dispatch({ type: 'SELFIE_MARK_DRAWING_SUBMITTED' });
      }
    };
    socket.on('selfie:drawing_ending', onDrawingEnding);
    return () => socket.off('selfie:drawing_ending', onDrawingEnding);
  }, [selfie.hasSubmittedDrawing, state.roomCode, dispatch]);

  const handleSkip = () => {
    sounds.click?.();
    socket.emit('selfie:skip_to_vote', { code: state.roomCode });
  };

  const handleRetake = () => {
    sounds.click?.();
    socket.emit('selfie:retake_photo', { code: state.roomCode });
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
      <div className="flex items-center justify-between w-full max-w-sm mb-1">
        <h1 className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mt-4">🎨 Draw on {selfie.assignedOwnerName}'s selfie!</h1>
        {selfie.secondsLeft > 0 && (
          <div className="mt-4 flex-shrink-0">
            <TimerRing secondsLeft={selfie.secondsLeft} total={selfie.timeLimit || 90} size={52} />
          </div>
        )}
      </div>
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

      {(
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
            {selfie.hasSubmittedDrawing ? '↑ Update Drawing' : 'Submit Drawing ✓'}
          </button>

          <button
            onClick={handleRetake}
            className="mt-2 text-sm text-[#4ECDC4] underline font-['Nunito'] hover:text-white transition"
          >
            📷 Retake Photo
          </button>
        </>
      )}

      {/* When submitted: show status but keep toolbar visible so player can update */}
      {selfie.hasSubmittedDrawing && (
        <div className="w-full max-w-xs bg-[#1A1A2E] rounded-xl border border-[#4ECDC4]/40 px-4 py-2 text-center mt-2">
          <p className="text-[#4ECDC4] font-['Fredoka_One'] text-sm">
            ✓ Drawing submitted! ({selfie.drawingCount}/{selfie.totalDrawers}) — you can still update it
          </p>
        </div>
      )}

      {state.isHost && (
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

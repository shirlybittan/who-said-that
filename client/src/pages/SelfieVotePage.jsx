import React, { useRef, useEffect } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

const CANVAS_W = 400;
const CANVAS_H = 300;

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

const SubmissionCanvas = ({ photoData, strokes }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    (strokes || []).forEach(s => drawStroke(ctx, s));
  }, [strokes]);

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-[#2D2D44]"
      style={{ width: '100%', aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
    >
      <img
        src={photoData}
        alt="selfie"
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    </div>
  );
};

export default function SelfieVotePage() {
  const { state, dispatch } = useGame();
  const selfie = state.selfie;
  const sounds = useSounds();

  const handleVote = (drawerId) => {
    if (selfie.hasVoted) return;
    if (drawerId === state.playerId) return;
    sounds.vote?.();
    socket.emit('selfie:vote', { code: state.roomCode, drawerId });
    dispatch({ type: 'SELFIE_MARK_VOTED', payload: { drawerId } });
  };

  const handleShowResults = () => {
    sounds.click?.();
    socket.emit('selfie:show_results', { code: state.roomCode });
  };

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <h1 className="text-2xl font-['Fredoka_One'] text-[#FF6B6B] mt-6 mb-2">Vote for Funniest! 😂</h1>
      {selfie.promptTemplate ? (
        <div className="bg-[#FFE66D]/10 border border-[#FFE66D]/30 rounded-xl px-4 py-2 mb-4 text-center">
          <p className="text-[#FFE66D] font-['Fredoka_One'] text-sm">
            {selfie.promptTemplate.replace('[Name]', '…')}
          </p>
        </div>
      ) : (
        <p className="text-gray-400 font-['Nunito'] text-sm mb-6">Which roast made you laugh?</p>
      )}

      <motion.div
        className="w-full max-w-md space-y-5 mb-6"
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } } }}
      >
        {selfie.submissions.map((sub) => {
          const isOwn = sub.drawerId === state.playerId;
          const selected = selfie.myVote === sub.drawerId;
          return (
            <motion.div
              key={sub.drawerId}
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } }}
              className={`rounded-2xl p-4 border-2 transition
                ${selected ? 'border-[#FF6B6B] bg-[#FF6B6B]/10' : 'border-[#2D2D44] bg-[#1A1A2E]'}
                ${!selfie.hasVoted && !isOwn ? 'cursor-pointer hover:border-[#FF6B6B]/60' : ''}
                ${isOwn ? 'opacity-60' : ''}`}
              onClick={() => !selfie.hasVoted && !isOwn && handleVote(sub.drawerId)}
            >
              <SubmissionCanvas photoData={sub.photoData} strokes={sub.strokes} />
              {sub.prompt && (
                <p className="mt-2 text-xs font-['Nunito'] text-[#FFE66D] italic">{sub.prompt}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: sub.drawerColor }} />
                <span className="font-['Nunito'] text-sm text-gray-300">
                  Drew: <span className="font-bold">{sub.drawerName}</span>
                  {isOwn && <span className="text-gray-500"> (yours — can't vote)</span>}
                </span>
              </div>
              <span className="text-xs text-gray-500 font-['Nunito']">on {sub.ownerName}'s selfie</span>
              {selected && <div className="mt-1 text-[#FF6B6B] font-['Fredoka_One']">✓ Your vote</div>}
            </motion.div>
          );
        })}
      </motion.div>

      {selfie.hasVoted && (
        <p className="text-gray-400 font-['Nunito'] text-sm">
          Waiting for results… ({selfie.voteCount}/{selfie.totalVoters} voted)
        </p>
      )}

      {state.isHost && (
        <button
          onClick={handleShowResults}
          className="mt-4 text-sm text-gray-400 underline font-['Nunito'] hover:text-white transition"
        >
          Show results now
        </button>
      )}
    </motion.div>
  );
}

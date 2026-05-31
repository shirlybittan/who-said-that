import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../store/gameStore.jsx';
import { motion } from 'framer-motion';

export default function DrawTelWaitPage() {
  const { state } = useGame();
  const { dt } = state;
  const navigate = useNavigate();

  // If a drawing turn arrives while waiting, go draw immediately
  useEffect(() => {
    if (dt.currentTurn && !dt.hasSubmittedTurn && dt.phase === 'drawing') {
      navigate('/draw-tel-draw');
    }
  }, [dt.currentTurn, dt.hasSubmittedTurn, dt.phase, navigate]);

  const phase = dt.phase;

  const title =
    phase === 'guessing' ? 'Guessing phase…' :
    phase === 'drawing'  ? 'Drawing phase…' :
    'Waiting…';

  const subtitle =
    phase === 'guessing' ? `Waiting for guessers… (${dt.guessedCount}/${dt.totalGuessers})` :
    phase === 'drawing'  ? `${dt.chainsCompletedCount}/${dt.totalChains} chains done` :
    'Hang tight!';

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    >
      <p className="text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest mb-4">📞 Draw Telephone</p>
      <p className="text-3xl font-['Fredoka_One'] text-[#FF6B6B] mb-3">{title}</p>
      <p className="text-gray-400 font-['Nunito'] text-sm mb-6">{subtitle}</p>

      {/* Chain progress dots */}
      {phase === 'drawing' && dt.totalChains > 0 && (
        <div className="flex gap-2 flex-wrap justify-center max-w-xs">
          {Array.from({ length: dt.totalChains }).map((_, i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-full transition-colors duration-500"
              style={{ backgroundColor: i < dt.chainsCompletedCount ? '#FF6B6B' : '#2D2D44' }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

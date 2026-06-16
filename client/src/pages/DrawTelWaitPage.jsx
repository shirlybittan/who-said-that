import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../store/gameStore.jsx';
import { motion } from 'framer-motion';
import { socket } from '../socket';

export default function DrawTelWaitPage() {
  const { state } = useGame();
  const { dt, playerId } = state;
  const navigate = useNavigate();

  // Only go back to the draw page if:
  // 1. We have an active turn (currentTurn set)
  // 2. We haven't submitted it yet
  // 3. The server confirms WE are currently an active drawer
  // This prevents stale currentTurn from a completed round triggering a redirect.
  useEffect(() => {
    const isActiveDrawer = dt.activeDrawerIds?.includes(playerId);
    if (dt.currentTurn && !dt.hasSubmittedTurn && dt.phase === 'drawing' && isActiveDrawer) {
      navigate('/draw-tel-draw');
    }
  }, [dt.currentTurn, dt.hasSubmittedTurn, dt.phase, dt.activeDrawerIds, playerId, navigate]);

  // If a guess turn arrives while waiting on the guess phase, go guess immediately
  useEffect(() => {
    if (dt.phase === 'guessing' && dt.guessTurn && !dt.hasGuessed) {
      navigate('/draw-tel-guess');
    }
  }, [dt.phase, dt.guessTurn, dt.hasGuessed, navigate]);

  // Recovery: if stuck in guessing phase without a guessTurn for >2.5s, re-request from server
  const recoveryTimerRef = useRef(null);
  useEffect(() => {
    if (dt.phase === 'guessing' && !dt.guessTurn) {
      // Give 2.5s for dt:your_guess to arrive naturally; if not, ask the server
      recoveryTimerRef.current = setTimeout(() => {
        if (!dt.guessTurn) { // re-check inside timeout (closure may be stale but it's a safety net)
          socket.emit('dt:request_guess', { code: state.roomCode });
        }
      }, 2500);
    } else {
      clearTimeout(recoveryTimerRef.current);
    }
    return () => clearTimeout(recoveryTimerRef.current);
  }, [dt.phase, dt.guessTurn, state.roomCode]);

  // If reveal phase arrives, go to reveal page immediately
  useEffect(() => {
    if (dt.phase === 'reveal') {
      navigate('/draw-tel-reveal');
    }
  }, [dt.phase, navigate]);

  // If end phase arrives, go to end page immediately
  useEffect(() => {
    if (dt.phase === 'end') {
      navigate('/draw-tel-end');
    }
  }, [dt.phase, navigate]);


  const phase = dt.phase;

  const title =
    phase === 'guessing' ? 'Guessing phase…' :
    phase === 'drawing'  ? 'Drawing phase…' :
    phase === 'reveal'   ? 'Reveal time!' :
    phase === 'end'      ? 'Game over!' :
    'Waiting…';

  const subtitle =
    phase === 'guessing' ? `Waiting for guessers… (${dt.guessedCount}/${dt.totalGuessers})` :
    phase === 'drawing'  ? `${dt.chainsCompletedCount}/${dt.totalChains} chains done` :
    phase === 'reveal'   ? 'Heading to the reveal…' :
    phase === 'end'      ? 'Heading to results…' :
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

      {/* Show who is currently drawing (when we can see it) */}
      {phase === 'drawing' && dt.activeDrawerIds?.length > 0 && (
        <p className="text-xs text-[#FF6B6B]/60 font-['Nunito'] mt-4 text-center">
          {dt.activeDrawerIds.length} player{dt.activeDrawerIds.length !== 1 ? 's are' : ' is'} drawing right now…
        </p>
      )}
    </motion.div>
  );
}

import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import Confetti from 'react-confetti';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import GameSwitcher from '../components/GameSwitcher.jsx';
import ReplayCanvas from '../components/game/ReplayCanvas';

const SubmissionCard = ({ sub, rank }) => {
  const medals = ['🥇', '🥈', '🥉'];
  const isWinner = rank === 0 && sub.votes > 0;

  return (
    <div className={`rounded-2xl p-4 border-2 ${isWinner ? 'border-[#FFE66D] bg-[#FFE66D]/10' : 'border-[#2D2D44] bg-[#1A1A2E]'}`}>
      <ReplayCanvas strokes={sub.strokes} photoData={sub.photoData} cssWidth="100%" className="rounded-xl overflow-hidden mb-3" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{medals[rank] || `${rank + 1}.`}</span>
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: sub.drawerColor }} />
          <span className="font-['Fredoka_One'] text-sm">{sub.drawerName}</span>
          <span className="text-gray-500 font-['Nunito'] text-xs">on {sub.ownerName}'s selfie</span>
        </div>
        <span className="font-['Nunito'] text-gray-400 text-sm">{sub.votes} {sub.votes === 1 ? 'vote' : 'votes'}</span>
      </div>
      {sub.prompt && (
        <p className="mt-1 text-xs font-['Nunito'] text-[#FFE66D] italic">{sub.prompt}</p>
      )}
    </div>
  );
};

export default function SelfieResultsPage() {
  const { state } = useGame();
  const navigate = useNavigate();
  const selfie = state.selfie;
  const sounds = useSounds();

  useEffect(() => { sounds.gameEnd?.(); }, []);

  const [win, setWin] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const fn = () => setWin({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const handlePlayAgain = () => socket.emit('selfie:restart', { code: state.roomCode });
  const handleMainMenu = () => navigate('/');

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <motion.div
      className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <Confetti width={win.width} height={win.height} recycle={false} numberOfPieces={280} />
      <h1 className="text-3xl font-['Fredoka_One'] text-[#FFE66D] mt-6 mb-1">Selfie Artist Results! 🎨</h1>
      {selfie.promptTemplate ? (
        <div className="bg-[#FFE66D]/10 border border-[#FFE66D]/30 rounded-xl px-4 py-2 mb-4 text-center">
          <p className="text-[#FFE66D] font-['Fredoka_One'] text-base">{selfie.promptTemplate.replace('[Name]', '…')}</p>
        </div>
      ) : (
        <p className="text-gray-400 font-['Nunito'] text-sm mb-6">📸 Selfie Challenge</p>
      )}

      {/* Submissions ranked by votes */}
      <motion.div
        className="w-full max-w-md space-y-4 mb-6"
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } } }}
      >
        {selfie.submissions.map((sub, i) => (
          <motion.div
            key={sub.drawerId}
            variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
          >
            <SubmissionCard sub={sub} rank={i} />
          </motion.div>
        ))}
      </motion.div>

      {/* Leaderboard */}
      <div className="w-full max-w-md bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-4 mb-6">
        <h3 className="text-lg font-['Fredoka_One'] text-[#FFE66D] mb-3">Leaderboard</h3>
        {selfie.leaderboard.map((p, i) => (
          <div key={p.id} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">{medals[i] || `${i + 1}.`}</span>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="font-['Nunito']">{p.name}</span>
            </div>
            <span className="font-['Fredoka_One'] text-[#FF6B6B]">{p.score} pts</span>
          </div>
        ))}
      </div>

      {state.isHost && (
        <button
          onClick={handlePlayAgain}
          className="w-full max-w-md bg-[#4ECDC4] text-black font-['Fredoka_One'] text-xl py-4 rounded-2xl hover:bg-[#3DBDB4] transition mb-3"
        >
          Play Again
        </button>
      )}
      <div className="w-full max-w-md mb-3">
        <GameSwitcher currentGameType={state.gameType} />
      </div>
      <button
        onClick={handleMainMenu}
        className="w-full max-w-md bg-[#1A1A2E] border border-[#2D2D44] text-gray-300 font-['Fredoka_One'] text-xl py-4 rounded-2xl hover:bg-[#2D2D44] transition"
      >
        Main Menu
      </button>
    </motion.div>
  );
}

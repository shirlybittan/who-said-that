import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import { useSounds } from '../hooks/useSounds';
import ReplayCanvas from '../components/game/ReplayCanvas';
import GameEndShell from '../components/game/GameEndShell';
import useSingleFlight from '../game-core/hooks/useSingleFlight';
import { getGame, gameLabel } from '../games/registry';

const MEDALS = ['🥇', '🥈', '🥉'];

const SubmissionCard = ({ sub, rank, t }) => {
  const isWinner = rank === 0 && sub.votes > 0;
  return (
    <div className={`rounded-2xl p-4 border-2 ${isWinner ? 'border-[#FFE66D] bg-[#FFE66D]/10' : 'border-[#2D2D44] bg-[#1A1A2E]'}`}>
      <ReplayCanvas strokes={sub.strokes} photoData={sub.photoData} cssWidth="100%" className="rounded-xl overflow-hidden mb-3" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">{MEDALS[rank] || `${rank + 1}.`}</span>
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: sub.drawerColor }} />
          <span className="font-['Fredoka_One'] text-sm truncate">{sub.drawerName}</span>
          <span className="text-gray-500 font-['Nunito'] text-xs truncate">→ {sub.ownerName}</span>
        </div>
        <span className="font-['Nunito'] text-gray-400 text-sm flex-shrink-0">{sub.votes} {sub.votes === 1 ? t.vote : t.votes}</span>
      </div>
      {sub.prompt && <p className="mt-1 text-xs font-['Nunito'] text-[#FFE66D] italic">{sub.prompt}</p>}
    </div>
  );
};

/**
 * Draw on Friends results. Between rounds: a round-results screen (no confetti,
 * no game-over sound) with Next Round for the host. After the last round: the
 * shared GameEndShell. It used to show the "final results" page — confetti,
 * game-end sound and a Play Again that restarted mid-game — after EVERY round
 * (AUDIT.md P2-23).
 */
export default function SelfieResultsPage() {
  const { state } = useGame();
  const selfie = state.selfie;
  const t = translations[state.lang]?.common || translations.en.common;
  const sounds = useSounds();
  const guard = useSingleFlight(1000);
  const accent = getGame('selfie-roast').accent;

  useEffect(() => { if (!selfie.isFinal) sounds.roundEnd?.(); }, [selfie.isFinal]); // eslint-disable-line react-hooks/exhaustive-deps

  const submissions = (
    <div className="w-full max-w-md space-y-4 my-4">
      {(selfie.submissions || []).map((sub, i) => <SubmissionCard key={sub.drawerId} sub={sub} rank={i} t={t} />)}
    </div>
  );

  if (selfie.isFinal) {
    return (
      <GameEndShell
        subtitle={gameLabel('selfie-roast', state.lang)}
        leaderboard={selfie.leaderboard || []}
        accentColor={accent}
        onPlayAgain={() => socket.emit('selfie:restart', { code: state.roomCode })}
        gameType={state.gameType}
      >
        {submissions}
      </GameEndShell>
    );
  }

  return (
    <motion.div
      data-testid="selfie-round-results"
      className="flex flex-col items-center min-h-[calc(100vh-3.5rem)] px-6 pt-2 pb-8"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
    >
      <h1 className="text-3xl font-['Fredoka_One'] mb-1" style={{ color: accent }}>{t.results}</h1>
      <p className="text-gray-400 font-['Nunito'] text-sm">{t.round.replace('{current}', selfie.round || 1).replace('{total}', selfie.totalRounds || 1)}</p>
      {selfie.promptTemplate && (
        <p className="mt-2 text-[#FFE66D] font-['Fredoka_One'] text-center">{selfie.promptTemplate.replace('[Name]', '…')}</p>
      )}
      {submissions}
      <div className="w-full max-w-md bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-4 mb-6">
        <h3 className="text-lg font-['Fredoka_One'] text-[#FFE66D] mb-3">{t.leaderboard}</h3>
        {(selfie.leaderboard || []).map((p, i) => (
          <div key={p.id} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">{MEDALS[i] || `${i + 1}.`}</span>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="font-['Nunito']">{p.name}</span>
            </div>
            <span className="font-['Fredoka_One'] text-[#FF6B6B]">{p.score} {t.pts}</span>
          </div>
        ))}
      </div>
      {state.isHost ? (
        <button
          data-testid="selfie-next-round"
          onClick={guard(() => socket.emit('selfie:next_round', { code: state.roomCode }))}
          className="w-full max-w-md py-4 rounded-2xl font-['Fredoka_One'] text-xl text-black active:scale-95 transition"
          style={{ backgroundColor: accent }}
        >
          {t.nextRound}
        </button>
      ) : (
        <p className="text-gray-400 font-['Nunito'] animate-pulse">{t.waitingHost}</p>
      )}
    </motion.div>
  );
}

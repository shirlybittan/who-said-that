import React from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../../store/gameStore.jsx';
import { socket } from '../../socket';
import { useSounds } from '../../hooks/useSounds';
import { translations } from '../../locales/translations';
import PlayerGameLayout from '../../game-core/layouts/PlayerGameLayout';
import { usePlayerGameFrame } from '../../game-core/hooks/usePlayerGameFrame';
import { useVoteConfirmation } from '../../game-core/hooks/useVoteConfirmation';
import useAutoConfirmPending from '../../game-core/hooks/useAutoConfirmPending';
import useSingleFlight from '../../game-core/hooks/useSingleFlight';
import ConfirmVoteCard from '../../game-core/player/ConfirmVoteCard';
import VoteLocked from '../../components/game/VoteLocked';

const ACCENT = { a: '#FF6B6B', b: '#4ECDC4' };

// ─── A/B choice buttons ──────────────────────────────────────────────────────
// Change rule (AUDIT.md Q1): the pick stays changeable until Confirm — tapping
// the other option swaps it (the first tap used to disable both, P1-03).
function TotChoiceButtons({ choices, pendingId, onSelect, orLabel }) {
  return (
    <div className="w-full flex flex-col gap-4">
      {choices.map((choice, i) => {
        const selected = pendingId === choice.id;
        const accent = ACCENT[choice.id];
        return (
          <React.Fragment key={choice.id}>
            <button
              data-testid={`tot-choice-${choice.id}`}
              onClick={() => onSelect(choice)}
              aria-pressed={selected}
              className="w-full rounded-2xl p-5 text-xl font-['Fredoka_One'] transition border-2 active:scale-95 bg-[#1A1A2E] text-white"
              style={{ borderColor: selected ? accent : `${accent}66`, backgroundColor: selected ? `${accent}22` : undefined }}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-['Nunito'] px-2 py-0.5 rounded-full text-black" style={{ backgroundColor: accent }}>
                  {choice.badge}
                </span>
                <span className="flex-1 text-center [overflow-wrap:anywhere]">{choice.label}</span>
                {selected && <span style={{ color: accent }}>✓</span>}
              </div>
            </button>
            {i === 0 && (
              <div className="relative flex items-center justify-center">
                <div className="h-px bg-[#2D2D44] flex-1" />
                <span className="mx-4 text-gray-500 font-['Fredoka_One'] text-lg">{orLabel}</span>
                <div className="h-px bg-[#2D2D44] flex-1" />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Round results (phones never used to see them — P1-02) ───────────────────
function TotResults({ tot, myId, t, isHost, onNext }) {
  const rows = [
    { id: 'a', label: tot.a, pct: tot.pctA || 0, count: tot.countA || 0 },
    { id: 'b', label: tot.b, pct: tot.pctB || 0, count: tot.countB || 0 },
  ];
  const mine = tot.myChoice;
  const inMajority = mine && tot.majorityChoice && mine === tot.majorityChoice;
  const scorers = [...(tot.scorePlayers || [])]
    .map(p => ({ ...p, score: tot.scores?.[p.id] || 0, delta: (tot.scores?.[p.id] || 0) - (tot.prevScores?.[p.id] || 0) }))
    .sort((x, y) => y.score - x.score);
  return (
    <div data-testid="tot-results" className="w-full flex flex-col gap-4">
      {rows.map((r, i) => {
        const win = tot.majorityChoice === r.id;
        return (
          <motion.div key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}
            className="w-full rounded-2xl p-4 border-2 bg-[#1A1A2E]" style={{ borderColor: win ? ACCENT[r.id] : '#2D2D44' }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-['Fredoka_One'] text-lg text-white [overflow-wrap:anywhere]">{r.id.toUpperCase()} · {r.label}</span>
              <span className="font-['Fredoka_One'] text-lg" style={{ color: ACCENT[r.id] }}>{r.pct}%</span>
            </div>
            <div className="w-full bg-[#2D2D44] rounded-full h-3 overflow-hidden">
              <motion.div className="h-3 rounded-full" style={{ backgroundColor: ACCENT[r.id] }} initial={{ width: 0 }} animate={{ width: `${r.pct}%` }} transition={{ duration: 0.8, delay: 0.2 + i * 0.15 }} />
            </div>
            <div className="flex justify-between mt-1 text-xs font-['Nunito'] text-gray-400">
              <span>{r.count} {r.count === 1 ? t.voteOne : t.votesIn}</span>
              {win && <span className="font-bold" style={{ color: ACCENT[r.id] }}>👑 {t.majority}</span>}
              {mine === r.id && <span className="text-white">← {t.youChose}</span>}
            </div>
          </motion.div>
        );
      })}
      <p className="text-center font-['Fredoka_One'] text-lg" style={{ color: inMajority ? '#4ECDC4' : '#FF8B94' }}>
        {!tot.majorityChoice ? t.tied : !mine ? t.noVote : inMajority ? t.score : t.againstCrowd}
      </p>
      {scorers.length > 0 && (
        <div className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-4">
          <p className="text-xs font-['Nunito'] text-gray-400 uppercase tracking-widest mb-2">{t.scoreboardTitle}</p>
          {scorers.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 py-1 font-['Nunito']">
              <span className="w-5 text-gray-500 text-sm">{i + 1}.</span>
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
              <span className={`flex-1 truncate ${p.id === myId ? 'text-white font-bold' : 'text-gray-300'}`}>{p.name}</span>
              {p.delta > 0 && <span className="text-[#4ECDC4] text-sm">+{p.delta}</span>}
              <span className="font-['Fredoka_One'] text-[#FFE66D]">{p.score}</span>
            </div>
          ))}
        </div>
      )}
      {isHost ? (
        <button data-testid="tot-next-round" onClick={onNext} className="w-full py-4 rounded-2xl font-['Fredoka_One'] text-xl text-white bg-[#6C5CE7] active:scale-95 transition">
          {tot.round >= tot.totalRounds ? t.seeScores : t.nextRound}
        </button>
      ) : (
        <p className="text-center text-gray-400 font-['Nunito'] animate-pulse">{t.waitingHost}</p>
      )}
    </div>
  );
}

// ─── Main player view ─────────────────────────────────────────────────────────

export default function ThisOrThatPlayerView() {
  const { state, dispatch } = useGame();
  const sounds = useSounds();
  const t = translations[state.lang].tot;
  const guard = useSingleFlight(1000);

  const { frame, actions } = usePlayerGameFrame({
    gameKey: 'this-or-that',
    state,
    socket,
    dispatch,
    context: { sounds, labels: { round: t.round, of: t.of, promptLabel: t.gameLabelShort } },
  });

  const vote = useVoteConfirmation({
    onConfirmSubmit: actions.submitChoice,
    resetKey: `${state.tot.round}-${state.tot.question}`,
  });
  useAutoConfirmPending({ pending: vote.pending, hasVoted: vote.confirmed || frame.hasSubmitted, onConfirm: vote.confirm });

  let selectionUI;
  if (frame.resultsVisible) {
    selectionUI = (
      <TotResults tot={state.tot} myId={state.playerId} t={t} isHost={state.isHost}
        onNext={guard(() => socket.emit('tot:next_round', { code: state.roomCode }))} />
    );
  } else if (frame.hasSubmitted) {
    const c = frame.submittedChoice;
    selectionUI = (
      <div className="w-full flex flex-col items-center">
        {c && (
          <div className="w-full bg-[#1A1A2E] rounded-2xl border-2 p-4 text-center" style={{ borderColor: ACCENT[c.id] }}>
            <span className="font-['Fredoka_One'] text-xl" style={{ color: ACCENT[c.id] }}>{c.badge} · {c.label}</span>
          </div>
        )}
        <VoteLocked voteCount={frame.voteCount} totalVoters={frame.totalVoters} label={t.voteLocked} accentColor={c ? ACCENT[c.id] : '#4ECDC4'} />
      </div>
    );
  } else if (state.isPlaying) {
    selectionUI = (
      <TotChoiceButtons
        choices={frame.choices}
        pendingId={vote.pending?.id}
        orLabel={t.or}
        onSelect={(choice) => { actions.playChoiceClick(); vote.choose(choice); }}
      />
    );
  } else {
    selectionUI = <VoteLocked voteCount={frame.voteCount} totalVoters={frame.totalVoters} label={t.waitingReveal} />;
  }

  return (
    <PlayerGameLayout
      frame={frame}
      selectionUI={selectionUI}
      confirmUI={
        vote.pending && !vote.confirmed && !frame.hasSubmitted && !frame.resultsVisible ? (
          <ConfirmVoteCard vote={vote.pending} onConfirm={vote.confirm} onChange={vote.change} accentColor={ACCENT[vote.pending.id]} />
        ) : null
      }
      jokerUI={null}
    />
  );
}

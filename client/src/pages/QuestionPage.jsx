import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';
import MiniGameWrapper from '../components/MiniGameWrapper.jsx';
import { useMiniGameLifecycle } from '../hooks/useMiniGameLifecycle.js';

export default function QuestionPage() {
  const { state, dispatch } = useGame();
  const t = translations[state.lang].question;
  const tSit = translations[state.lang].situational;
  const [answer, setAnswer] = useState('');
  const [hasVotedSkip, setHasVotedSkip] = useState(false);
  const sounds = useSounds();

  // Use server-driven timer (phaseTimer updated by phase_timer socket events)
  const serverTimeLeft = state.phaseTimer?.secondsLeft ?? 0;
  const timerActive = state.phaseTimer?.active ?? false;
  const timerPaused = state.phaseTimer?.paused ?? false;

  const isSituational = state.currentRoundType === 'situational';
  const target = state.situationalTarget;

  const doSubmitAnswer = () => {
    if (!answer.trim()) return;
    sounds.success();
    socket.emit('submit_answer', { code: state.roomCode, text: answer.trim() });
    dispatch({ type: 'MARK_ANSWERED', payload: { myAnswer: answer.trim() } });
  };

  const { hasConfirmed, confirm, editResponse, markConfirmed } = useMiniGameLifecycle({
    onSubmit: doSubmitAnswer,
    resetKey: state.currentQuestion,
    initialConfirmed: state.hasAnswered,
  });

  useEffect(() => {
    setHasVotedSkip(false);
    sounds.reveal();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentQuestion]);

  const autoSubmitRef = React.useRef({ answer });
  useEffect(() => { autoSubmitRef.current = { answer }; });

  // Send a draft to the server on every keystroke (debounced 300 ms) so that
  // the server can auto-submit the draft if the timer expires before the player
  // manually confirms their answer.
  const draftTimerRef = React.useRef(null);
  const handleAnswerChange = (newText) => {
    setAnswer(newText);
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      socket.emit('answer_draft', { code: state.roomCode, text: newText });
    }, 300);
  };

  const timerWasActiveRef = React.useRef(false);
  useEffect(() => {
    if (timerActive) timerWasActiveRef.current = true;
  }, [timerActive]);

  // Auto-submit when server timer hits 0
  useEffect(() => {
    if (!state.isPlaying) return;
    if (hasConfirmed) return;
    if (state.phase !== 'question') return;
    if (!timerWasActiveRef.current) return; // timer never started — don't fire
    if (serverTimeLeft <= 0 && timerActive === false) {
      // Timer just expired
      let textToSubmit = autoSubmitRef.current.answer.trim();
      if (!textToSubmit) textToSubmit = "I couldn't think of anything funny in time! 🕒";
      socket.emit('submit_answer', { code: state.roomCode, text: textToSubmit });
      dispatch({ type: 'MARK_ANSWERED', payload: { myAnswer: textToSubmit } });
      markConfirmed();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTimeLeft, timerActive, hasConfirmed, state.isPlaying, state.phase]);

  // Play tick sounds based on server timer
  useEffect(() => {
    if (!timerActive || timerPaused || hasConfirmed) return;
    if (serverTimeLeft > 0 && serverTimeLeft <= 5) sounds.tickUrgent?.();
    else if (serverTimeLeft > 0 && serverTimeLeft <= 15) sounds.tick?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTimeLeft]);

  const handleSkip = () => {
    sounds.click();
    socket.emit('skip_question', { code: state.roomCode });
  };

  const handleVoteSkip = () => {
    if (hasVotedSkip) return;
    sounds.click();
    socket.emit('vote_skip_question', { code: state.roomCode });
    setHasVotedSkip(true);
  };

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 text-center shadow-lg"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
<div className="mt-16 mb-8 w-full max-w-lg">
          <h3 className="text-xl font-['Fredoka_One'] text-[#FFE66D] uppercase tracking-widest mb-2">
            {t.round} {state.currentRound} {t.of} {state.totalRounds}
          </h3>
          {/* Server-driven timer */}
          {timerActive && !hasConfirmed && (
            <p className={`text-xl font-bold font-['Nunito'] mb-2 ${serverTimeLeft <= 5 ? 'text-red-400 animate-pulse' : serverTimeLeft <= 15 ? 'text-orange-400' : 'text-gray-400'}`}>
              ⏳ {serverTimeLeft}s
            </p>
          )}

        {/* Situational: target player badge */}
        {isSituational && target && (
          <div className="flex items-center justify-center gap-3 mb-4 bg-[#1A1A2E] border border-[#6C5CE7]/60 rounded-xl px-4 py-3">
            <span className="text-xs font-['Nunito'] text-[#6C5CE7] uppercase tracking-widest">{tSit.targetBadge}</span>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-black font-bold text-sm border-2 border-white/20"
              style={{ backgroundColor: target.color }}
            >
              {target.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-['Fredoka_One'] text-lg text-white">{target.name}</span>
          </div>
        )}

        {/* Mode badge for situational */}
        {isSituational && (
          <div className="mb-3">
            <span className="text-xs px-3 py-1 rounded-full font-['Nunito'] font-bold uppercase tracking-wider bg-[#6C5CE7]/20 text-[#6C5CE7] border border-[#6C5CE7]/40">
              🎭 {tSit.gameLabel}
            </span>
          </div>
        )}

        <h1 className="text-4xl md:text-5xl font-['Nunito'] font-bold text-white mt-4">
          "{typeof state.currentQuestion === 'string' ? state.currentQuestion : (state.currentQuestion?.[state.lang] || state.currentQuestion?.en)}"
        </h1>
      </div>

      {/* Answer form — only for playing participants */}
      {!state.isPlaying ? (
        // Spectator / cast-screen view
        <div className="w-full max-w-md bg-[#1A1A2E] p-6 rounded-2xl border border-[#2D2D44] text-center">
          <p className="text-4xl font-['Fredoka_One'] text-[#4ECDC4]">
            {state.answeredCount} <span className="text-gray-400 text-2xl">/ {state.totalPlayers || state.players.filter(p => p.isPlaying).length}</span>
          </p>
          <p className="text-sm font-['Nunito'] text-gray-400 mt-1 uppercase tracking-wider">{t.answered}</p>
          <div className="mt-3 w-full bg-[#2D2D44] rounded-full h-2">
            <div
              className="bg-[#4ECDC4] h-2 rounded-full transition-all duration-500"
              style={{ width: (state.totalPlayers || state.players.filter(p => p.isPlaying).length) > 0 ? `${(state.answeredCount / (state.totalPlayers || state.players.filter(p => p.isPlaying).length)) * 100}%` : '0%' }}
            />
          </div>
          {state.isHost && (
            <button
              onClick={handleSkip}
              className="mt-6 text-gray-500 hover:text-white underline font-['Nunito'] transition block w-full"
            >
              {t.skipHost}
            </button>
          )}
        </div>
      ) : (
        <div className="w-full max-w-md">
          <MiniGameWrapper
            hasConfirmed={hasConfirmed}
            onConfirm={confirm}
            onEditResponse={editResponse}
            onChangePrompt={state.isHost ? handleSkip : undefined}
            confirmLabel={state.hasAnswered ? '↑ Update' : t.submitBtn}
            disableConfirm={!answer.trim()}
            isHost={state.isHost}
          >
            <textarea
              value={answer}
              onChange={(e) => handleAnswerChange(e.target.value)}
              placeholder={isSituational && target ? `What would ${target.name} say?` : t.typeAnswerPlaceholder}
              className="w-full p-4 rounded-xl text-black bg-white focus:bg-[#FFF] font-['Nunito'] text-[16px] border-4 border-transparent focus:border-[#FFE66D] focus:outline-none resize-none h-32"
              maxLength={150}
            />
          </MiniGameWrapper>
          <p className="text-xs text-gray-500 font-['Nunito'] mt-3 text-center">
            {state.answeredCount} / {state.totalPlayers || state.players.length} {t.answered}
          </p>
          <button
            onClick={handleVoteSkip}
            disabled={hasVotedSkip}
            className={`mt-4 text-gray-400 font-['Nunito'] transition ${hasVotedSkip ? 'opacity-50 cursor-not-allowed' : 'hover:text-white underline block w-full'}`}
          >
            {hasVotedSkip ? t.votedSkip : t.voteSkip}
          </button>
        </div>
      )}
    </motion.div>
  );
}

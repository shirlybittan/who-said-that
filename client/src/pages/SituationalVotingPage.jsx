import React from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';

export default function SituationalVotingPage() {
  const { state, dispatch } = useGame();
  const t = translations[state.lang].situational;
  const sit = state.sit;

  const handleVote = (answerId) => {
    if (sit.hasVoted) return;
    if (answerId === state.playerId) return; // can't vote own answer

    socket.emit('sit:vote', { code: state.roomCode, answerId });
    dispatch({ type: 'SIT_MARK_VOTED', payload: { answerId } });
  };

  const handleContinue = () => {
    socket.emit('sit:next', { code: state.roomCode });
  };

  // ── RESULTS VIEW ──────────────────────────────────────────────────────────
  if (sit.phase === 'results') {
    const sorted = [...sit.answers].sort((a, b) => b.votes - a.votes);
    const maxVotes = sorted[0]?.votes ?? 0;

    return (
      <div className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6">
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FF6B6B] mb-2 mt-4">{t.resultsTitle}</h1>
        <p className="text-gray-400 font-['Nunito'] mb-6 italic text-center">"{sit.question}"</p>

        <div className="w-full max-w-md space-y-3 mb-6">
          {sorted.map((ans) => {
            const isWinner = ans.votes === maxVotes && maxVotes > 0;
            return (
              <div
                key={ans.id}
                className={`rounded-2xl p-4 border-2 ${isWinner ? 'border-[#FFE66D] bg-[#FFE66D]/10' : 'border-[#2D2D44] bg-[#1A1A2E]'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ans.authorColor }}
                    />
                    <span className="font-['Fredoka_One'] text-sm">{ans.authorName}</span>
                    {isWinner && <span className="text-lg">⭐</span>}
                  </div>
                  <span className="text-sm font-['Nunito'] text-gray-400">
                    {ans.votes} {ans.votes === 1 ? 'vote' : 'votes'}
                  </span>
                </div>
                <p className="text-white font-['Nunito'] italic">"{ans.text}"</p>
              </div>
            );
          })}
        </div>

        {/* Scoreboard */}
        <div className="w-full max-w-md bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-4 mb-6">
          <h3 className="text-lg font-['Fredoka_One'] text-[#FFE66D] mb-3">Scores</h3>
          {[...sit.scorePlayers]
            .sort((a, b) => (sit.scores[b.id] || 0) - (sit.scores[a.id] || 0))
            .map((p) => (
              <div key={p.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="font-['Nunito']">{p.name}</span>
                </div>
                <span className="font-['Fredoka_One'] text-[#FF6B6B]">{sit.scores[p.id] || 0} pts</span>
              </div>
            ))}
        </div>

        {state.isHost ? (
          <button
            onClick={handleContinue}
            className="w-full max-w-md bg-[#FFE66D] hover:bg-[#ffdd33] text-black font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] shadow-lg uppercase"
          >
            {t.continueBtn}
          </button>
        ) : (
          <p className="text-gray-400 font-['Nunito'] mt-4">{t.waitingHost}</p>
        )}
      </div>
    );
  }

  // ── VOTING VIEW ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6">
      <h1 className="text-3xl font-['Fredoka_One'] text-[#4ECDC4] mb-2 mt-4">{t.votePrompt}</h1>
      <p className="text-gray-400 font-['Nunito'] mb-1 italic text-center">"{sit.question}"</p>

      <p className="text-sm text-gray-500 font-['Nunito'] mb-6">
        {sit.hasVoted
          ? t.waitingOthers.replace('{count}', sit.voteCount).replace('{total}', sit.totalVoters)
          : t.noSelfVote}
      </p>

      <div className="w-full max-w-md space-y-3">
        {sit.answers.map((ans) => {
          const isOwn = ans.id === state.playerId;
          const isSelected = sit.myVote === ans.id;

          return (
            <button
              key={ans.id}
              onClick={() => handleVote(ans.id)}
              disabled={sit.hasVoted || isOwn}
              className={`w-full text-left rounded-2xl p-4 border-2 transition transform
                ${isSelected
                  ? 'border-[#4ECDC4] bg-[#4ECDC4]/15 scale-[1.02]'
                  : isOwn
                    ? 'border-[#2D2D44] bg-[#1A1A2E] opacity-40 cursor-not-allowed'
                    : sit.hasVoted
                      ? 'border-[#2D2D44] bg-[#1A1A2E] opacity-60 cursor-not-allowed'
                      : 'border-[#2D2D44] bg-[#1A1A2E] hover:border-[#4ECDC4] hover:bg-[#4ECDC4]/10 active:scale-95 cursor-pointer'
                }`}
            >
              <p className="font-['Nunito'] text-white italic">"{ans.text}"</p>
              {isOwn && (
                <p className="text-xs text-gray-500 mt-1 font-['Nunito']">({t.noSelfVote})</p>
              )}
            </button>
          );
        })}
      </div>

      {sit.hasVoted && (
        <div className="mt-6 text-center">
          <p className="text-[#4ECDC4] font-['Fredoka_One'] text-lg">{t.voteLockedMsg}</p>
        </div>
      )}
    </div>
  );
}

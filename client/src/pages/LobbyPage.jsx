import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';
import { translations } from '../locales/translations';
import { motion, AnimatePresence } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

const GAME_TYPES = [
  { id: 'who-said-that',  emoji: '🤔', key: 'gameWst',   color: '#FFE66D',  dark: '#0D0D1A' },
  { id: 'situational',    emoji: '🎭', key: 'gameSit',   color: '#A8E6CF',  dark: '#0D0D1A' },
  { id: 'this-or-that',   emoji: '⚡', key: 'gameTot',   color: '#6C5CE7',  dark: '#F7F7F7' },
  { id: 'most-likely-to', emoji: '👑', key: 'gameMlt',   color: '#4ECDC4',  dark: '#0D0D1A' },
  { id: 'mixed',          emoji: '🎲', key: 'gameMixed', color: '#FF8B94',  dark: '#0D0D1A' },
  { id: 'drawing',        emoji: '🎨', key: 'gameDraw',  color: '#C39BD3',  dark: '#0D0D1A' },
];

export default function LobbyPage() {
  const { state } = useGame();
  const [customQuestion, setCustomQuestion] = useState('');
  const [saveToBank, setSaveToBank] = useState(false);
  const sounds = useSounds();
  const prevPlayerCount = useRef(state.players.length);

  useEffect(() => {
    const current = state.players.length;
    if (current > prevPlayerCount.current) {
      sounds.join();
    }
    prevPlayerCount.current = current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.players.length]);

  const t = translations[state.lang].lobby;
  const tMlt = translations[state.lang].mlt;
  const tSit = translations[state.lang].situational;
  const tTot = translations[state.lang].tot;
  const tMixed = translations[state.lang].mixed;
  const tHome = translations[state.lang].home;
  const tDraw = translations[state.lang].draw;
  const isMlt = state.gameType === 'most-likely-to';
  const isWstLike = ['who-said-that', 'situational', 'mixed'].includes(state.gameType);
  const isTot = state.gameType === 'this-or-that';
  const isDraw = state.gameType === 'drawing';

  const activeType = GAME_TYPES.find(g => g.id === state.gameType) || GAME_TYPES[0];

  const handleStartGame = () => {
    if (state.players.filter(p => p.isPlaying).length < 3) return alert('Need at least 3 players to start!');
    sounds.click();
    if (isMlt) {
      socket.emit('mlt:start', {
        code: state.roomCode,
        rounds: state.mlt.totalRounds,
      });
    } else if (isDraw) {
      socket.emit('draw:start', { code: state.roomCode, rounds: state.totalRounds });
      return;
    } else {
      if (state.gameType === 'who-said-that' && state.mode === 'custom' && (!state.customQuestions || state.customQuestions.length < state.totalRounds)) {
        return alert(t.needCustom.replace('{count}', state.totalRounds));
      }
      socket.emit('start_game', { code: state.roomCode });
    }
  };

  const handleOptionsChange = (option, value) => {
    if (!state.isHost) return;
    socket.emit('set_game_options', {
      code: state.roomCode,
      mode: option === 'mode' ? value : state.mode,
      totalRounds: option === 'rounds' ? value : state.totalRounds,
      gameType: option === 'gameType' ? value : state.gameType,
      mltRounds: option === 'mltRounds' ? value : state.mlt.totalRounds,
      allowSelfVote: option === 'allowSelfVote' ? value : state.mlt.allowSelfVote,
    });
  };

  const handleAddCustomQuestion = (e) => {
    e.preventDefault();
    if (!customQuestion.trim()) return;
    socket.emit('add_custom_question', { code: state.roomCode, text: customQuestion.trim(), saveToBank });
    setCustomQuestion('');
    setSaveToBank(false);
  };

  if (state.joinedMidRound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 gap-6">
        <div className="text-6xl">⚡</div>
        <h1 className="text-3xl font-['Fredoka_One'] text-[#FFE66D] text-center">You've joined!</h1>
        <p className="text-gray-300 font-['Nunito'] text-center text-lg">A round is in progress. Hang tight — you'll jump in at the next round.</p>
        <div className="bg-[#1A1A2E] border-2 border-[#2D2D44] p-5 rounded-2xl text-center">
          <p className="text-gray-400 font-['Nunito'] text-sm uppercase tracking-widest mb-1">Room Code</p>
          <p className="text-4xl font-['Fredoka_One'] tracking-widest text-white">{state.roomCode}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-24">
      <h2 className="text-3xl font-['Fredoka_One'] text-[#FFE66D] mb-4">{t.title}</h2>

      <div className="bg-[#1A1A2E] border-2 border-[#2D2D44] p-6 rounded-2xl shadow-xl w-full max-w-md text-center mb-4 relative">
        <p className="text-gray-400 font-['Nunito'] text-sm uppercase tracking-widest mb-2">{t.roomCode}</p>
        <h1 className="text-6xl font-['Fredoka_One'] tracking-widest text-white">{state.roomCode}</h1>
      </div>

      {/* Game type badge (visible to everyone) */}
      <div className="w-full max-w-md mb-4 flex items-center justify-center gap-2">
        <span
          className="text-xs px-3 py-1 rounded-full font-['Nunito'] font-bold uppercase tracking-wider border"
          style={{ backgroundColor: `${activeType.color}20`, color: activeType.color, borderColor: `${activeType.color}60` }}
        >
          {activeType.emoji} {tHome[activeType.key] || activeType.id}
        </span>
      </div>

      <div className="bg-[#1A1A2E] rounded-2xl w-full max-w-md border border-[#2D2D44] p-4 mb-8 text-left h-full flex flex-col justify-between">
         <h3 className="text-xl font-bold mb-4 font-['Fredoka_One'] text-[#FF6B6B]">{t.players} ({state.players?.filter(p => p.isPlaying).length || 0})</h3>
         <div className="flex flex-wrap gap-3">
          <AnimatePresence>
          {state.players?.filter(p => p.isPlaying).map((p, idx) => (
             <motion.div
               key={p.id}
               layout
               initial={{ opacity: 0, scale: 0.7 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.7 }}
               transition={{ type: 'spring', stiffness: 400, damping: 22 }}
               className="flex items-center space-x-2 bg-black bg-opacity-30 rounded-full px-3 py-2 border border-gray-800"
             >
               <div className="w-8 h-8 rounded-full flex items-center justify-center text-black font-bold border-2 border-white shadow-sm" style={{ backgroundColor: p.color }}>
                 {p.name.charAt(0).toUpperCase()}
               </div>
               <span className="font-['Nunito'] font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-[120px] text-white">
                 {p.name} {p.isHost && '👑'}
               </span>
               {state.isHost && p.id !== state.playerId && (
                 <button
                   onClick={() => socket.emit('kick_player', { code: state.roomCode, targetPlayerId: p.id })}
                   className="ml-2 text-red-500 hover:text-red-700 text-xs font-bold px-2 py-1 rounded bg-black border border-red-500 hover:bg-red-900 transition"
                 >
                   {t.kick}
                 </button>
               )}
             </motion.div>
          ))}
          </AnimatePresence>
         </div>
      </div>

      {state.isHost && (
        <div className="bg-[#1A1A2E] rounded-2xl w-full max-w-md border border-[#2D2D44] p-4 mb-32 text-left">
           <h3 className="text-lg font-bold mb-2 font-['Fredoka_One'] text-[#A8E6CF]">
             {isMlt ? '✨ Custom MLT Prompts' : t.customQuestions} ({state.customQuestions?.length || 0})
           </h3>
           {isMlt && (
             <p className="text-xs text-gray-500 mb-3 font-['Nunito']">
               Add your own "Who is most likely to..." prompts — they'll be used first.
             </p>
           )}
           <div className="max-h-32 overflow-y-auto mb-4 space-y-2 pr-2">       
             {state.customQuestions?.length > 0 ? state.customQuestions.map(q => (
               <p key={q.id} className="bg-[#0D0D1A] p-2 rounded-md text-sm border border-[#2D2D44] font-['Nunito'] text-gray-300">
                 {q.text}
               </p>
             )) : <p className="text-gray-500 italic text-sm">{t.noCustom}</p>}
           </div>
           <form onSubmit={handleAddCustomQuestion} className="flex flex-col gap-2">
             <div className="flex gap-2">
               <input
                 type="text"
                 value={customQuestion}
                 onChange={(e) => setCustomQuestion(e.target.value)}
                 placeholder={t.addCustomPlaceholder}
                 className="flex-1 p-2 rounded-lg text-black text-sm border border-transparent focus:border-[#A8E6CF] focus:outline-none"
               />
               <button type="submit" disabled={!customQuestion.trim()} className="bg-[#A8E6CF] text-black px-4 py-2 rounded-lg font-bold hover:bg-[#85e1b8] transition">{t.addBtn}</button>
             </div>
             <label className="flex items-center space-x-2 text-sm text-gray-300 font-['Nunito'] pl-1">
               <input
                 type="checkbox"
                 checked={saveToBank}
                 onChange={(e) => setSaveToBank(e.target.checked)}
                 className="rounded border-[#2D2D44] bg-[#0D0D1A] text-[#A8E6CF]"
               />
               <span>{t.saveBank}</span>
             </label>
           </form>
        </div>
      )}

      {state.isHost ? (
        <div className={`fixed bottom-0 w-full bg-[#1A1A2E] p-4 border-t-2 border-[${activeType.color}] flex flex-col items-center shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-50 gap-3`}>

          {/* Game type picker — 6 buttons */}
          <div className="grid grid-cols-3 w-full max-w-sm gap-1">
            {GAME_TYPES.map(gt => {
              const isSelected = state.gameType === gt.id || (state.gameType === 'mixed' && state.selectedSubGames?.includes(gt.id));
              
              const handleGameToggle = () => {
                const arr = state.gameType === 'mixed' ? (state.selectedSubGames || []) : [state.gameType];
                if (gt.id === 'mixed') {
                  handleOptionsChange('gameType', ['mixed']);
                  return;
                }
                const noMixed = arr.filter(id => id !== 'mixed');
                const updated = noMixed.includes(gt.id) ? noMixed.filter(id => id !== gt.id) : [...noMixed, gt.id];
                if (updated.length === 0) updated.push(gt.id); // Prevent empty selection
                handleOptionsChange('gameType', updated);
              };

              return (
                <button
                  key={gt.id}
                  onClick={handleGameToggle}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-xs font-['Fredoka_One'] transition border-2 ${isSelected ? `border-[${gt.color}] text-white` : 'border-transparent bg-[#0D0D1A] text-gray-400 hover:text-white hover:bg-[#2D2D44]'}`}
                  style={isSelected ? { backgroundColor: gt.color + '33', borderColor: gt.color } : {}}
                  title={gt.id}
                >
                  <span className="text-lg leading-none">{gt.emoji}</span>
                  <span className="mt-0.5 leading-tight text-center" style={{ fontSize: '0.6rem' }}>{gt.id === 'who-said-that' ? t.gameLabelShort : gt.id === 'most-likely-to' ? tMlt.gameLabelShort : gt.id === 'situational' ? tSit.gameLabelShort : gt.id === 'this-or-that' ? tTot.gameLabelShort : gt.id === 'drawing' ? tDraw.gameLabelShort : tMixed.gameLabelShort}</span>
                </button>
              );
            })}
          </div>

          {/* Mixed mode: sub-game selector */}
          {state.gameType === 'mixed' && (
            <div className="w-full max-w-sm bg-[#0D0D1A] border border-[#FF8B94]/40 rounded-xl p-3">
              <p className="text-xs font-['Nunito'] text-[#FF8B94] uppercase tracking-widest mb-2">Include in mix:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'who-said-that', emoji: '🤔', label: t.gameLabelShort, color: '#FFE66D' },
                  { id: 'situational',   emoji: '🎭', label: tSit.gameLabelShort, color: '#A8E6CF' },
                  { id: 'this-or-that',  emoji: '⚡', label: tTot.gameLabelShort, color: '#6C5CE7' },
                  { id: 'most-likely-to',emoji: '👑', label: tMlt.gameLabelShort, color: '#4ECDC4' },
                  { id: 'drawing',       emoji: '🎨', label: tDraw.gameLabelShort, color: '#C39BD3' },
                ].map(sg => {
                  const included = (state.selectedSubGames || []).includes(sg.id);
                  const toggle = () => {
                    const cur = state.selectedSubGames || [];
                    const updated = included ? cur.filter(id => id !== sg.id) : [...cur, sg.id];
                    if (updated.length === 0) return; // need at least one
                    handleOptionsChange('gameType', updated);
                  };
                  return (
                    <button
                      key={sg.id}
                      onClick={toggle}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-['Fredoka_One'] border-2 transition"
                      style={included
                        ? { backgroundColor: sg.color + '33', borderColor: sg.color, color: sg.color }
                        : { backgroundColor: 'transparent', borderColor: '#2D2D44', color: '#555' }}
                    >
                      <span>{sg.emoji}</span>
                      <span>{sg.label}</span>
                      {included ? <span>✓</span> : <span style={{ opacity: 0.4 }}>✗</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* WST / Situational / Mixed options */}
          {isWstLike && (
            <div className="flex space-x-4 w-full max-w-sm">
              <select
                value={state.mode}
                onChange={(e) => handleOptionsChange('mode', e.target.value)}
                className="bg-[#0D0D1A] text-white p-2 rounded-lg border border-[#2D2D44] font-['Nunito'] w-1/2"
              >
                <option value="friends">{t.friendsMode}</option>
                <option value="family">{t.familyMode}</option>
                <option value="custom">{t.customMode}</option>
              </select>
              <select
                value={state.totalRounds}
                onChange={(e) => handleOptionsChange('rounds', parseInt(e.target.value))}
                className="bg-[#0D0D1A] text-white p-2 rounded-lg border border-[#2D2D44] font-['Nunito'] w-1/2"
              >
                <option value={2}>2 {t.rounds}</option>
                <option value={3}>3 {t.rounds}</option>
                <option value={4}>4 {t.rounds}</option>
                <option value={5}>5 {t.rounds}</option>
              </select>
            </div>
          )}

          {/* This-or-That standalone rounds */}
          {isTot && (
            <div className="flex w-full max-w-sm">
              <select
                value={state.totalRounds}
                onChange={(e) => handleOptionsChange('rounds', parseInt(e.target.value))}
                className="bg-[#0D0D1A] text-white p-2 rounded-lg border border-[#2D2D44] font-['Nunito'] w-full"
              >
                <option value={3}>3 {t.rounds}</option>
                <option value={5}>5 {t.rounds}</option>
                <option value={7}>7 {t.rounds}</option>
                <option value={10}>10 {t.rounds}</option>
              </select>
            </div>
          )}

          {/* Drawing rounds */}
          {isDraw && (
            <div className="flex w-full max-w-sm">
              <select
                value={state.totalRounds}
                onChange={(e) => handleOptionsChange('rounds', parseInt(e.target.value))}
                className="bg-[#0D0D1A] text-white p-2 rounded-lg border border-[#2D2D44] font-['Nunito'] w-full"
              >
                {[3, 4, 5, 6].map(n => (
                  <option key={n} value={n}>{n} {tDraw.rounds}</option>
                ))}
              </select>
            </div>
          )}

          {/* MLT options */}
          {isMlt && (
            <div className="flex items-center gap-4 w-full max-w-sm">
              <select
                value={state.mlt.totalRounds}
                onChange={(e) => handleOptionsChange('mltRounds', parseInt(e.target.value))}
                className="bg-[#0D0D1A] text-white p-2 rounded-lg border border-[#2D2D44] font-['Nunito'] w-full"
              >
                {[5,6,7,8,9,10,12,15,20].map(n => (
                  <option key={n} value={n}>{n} {tMlt.rounds}</option>
                ))}
              </select>
            </div>
          )}

          <button
            disabled={state.players?.filter(p => p.isPlaying).length < 3}
            onClick={handleStartGame}
            style={state.players?.filter(p => p.isPlaying).length >= 3 ? { backgroundColor: activeType.color } : {}}
            className={`w-full max-w-sm font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] shadow-lg uppercase tracking-wide text-black ${state.players?.filter(p => p.isPlaying).length < 3 ? 'bg-gray-600 cursor-not-allowed text-white' : 'hover:opacity-90'}`}
          >
            {t.startBtn}
          </button>
        </div>
      ) : (
        <div className="fixed bottom-0 w-full bg-[#1A1A2E] p-6 border-t-2 border-[#FF6B6B] flex flex-col items-center shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-50">
            <p className="text-[#FF6B6B] font-['Fredoka_One'] text-xl animate-pulse">{t.waitingHost}</p>
        </div>
      )}
    </div>
  );
}

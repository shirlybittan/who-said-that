import React, { useState } from 'react';
import { useGame } from '../store/gameStore.jsx';
import { socket } from '../socket';

export default function LobbyPage() {
  const { state } = useGame();
  const [customQuestion, setCustomQuestion] = useState('');

  const handleStartGame = () => {
    if (state.players.length < 3) return alert('Need at least 3 players to start!');
    if (state.mode === 'custom' && (!state.customQuestions || state.customQuestions.length < state.totalRounds)) {
      return alert(`Need at least ${state.totalRounds} custom questions to start Custom Mode! Add more.`);
    }
    socket.emit('start_game', { code: state.roomCode });
  };

  const handleOptionsChange = (option, value) => {
    if (state.isHost) {
      socket.emit('set_game_options', { 
        code: state.roomCode, 
        mode: option === 'mode' ? value : state.mode, 
        totalRounds: option === 'rounds' ? value : state.totalRounds 
      });
    }
  };

  const handleAddCustomQuestion = (e) => {
    e.preventDefault();
    if (!customQuestion.trim()) return;
    socket.emit('add_custom_question', { code: state.roomCode, text: customQuestion.trim() });
    setCustomQuestion('');
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 pb-24">
      <h2 className="text-3xl font-['Fredoka_One'] text-[#FFE66D] mb-4">Lobby</h2>
      
      <div className="bg-[#1A1A2E] border-2 border-[#2D2D44] p-6 rounded-2xl shadow-xl w-full max-w-md text-center mb-8 relative">
        <p className="text-gray-400 font-['Nunito'] text-sm uppercase tracking-widest mb-2">Room Code</p>
        <h1 className="text-6xl font-['Fredoka_One'] tracking-widest text-white">{state.roomCode}</h1>
      </div>

      <div className="bg-[#1A1A2E] rounded-2xl w-full max-w-md border border-[#2D2D44] p-4 mb-8 text-left h-full flex flex-col justify-between">
         <h3 className="text-xl font-bold mb-4 font-['Fredoka_One'] text-[#FF6B6B]">Players ({state.players?.length || 0})</h3>
         <div className="flex flex-wrap gap-3">
          {state.players?.map((p, idx) => (
             <div key={idx} className="flex items-center space-x-2 bg-black bg-opacity-30 rounded-full px-3 py-2 border border-gray-800">
               <div className="w-8 h-8 rounded-full flex items-center justify-center text-black font-bold border-2 border-white shadow-sm" style={{ backgroundColor: p.color }}>
                 {p.name.charAt(0).toUpperCase()}
               </div>
               <span className="font-['Nunito'] font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-[120px]">{p.name} {p.isHost && '👑'}</span>
             </div>
          ))}
         </div>
      </div>

      {state.mode === 'custom' && (
        <div className="bg-[#1A1A2E] rounded-2xl w-full max-w-md border border-[#2D2D44] p-4 mb-32 text-left">
           <h3 className="text-lg font-bold mb-2 font-['Fredoka_One'] text-[#A8E6CF]">Custom Questions ({state.customQuestions?.length || 0})</h3>
           <div className="max-h-32 overflow-y-auto mb-4 space-y-2 pr-2">
             {state.customQuestions?.length > 0 ? state.customQuestions.map(q => (
               <p key={q.id} className="bg-[#0D0D1A] p-2 rounded-md text-sm border border-[#2D2D44] font-['Nunito'] text-gray-300">
                 {q.text}
               </p>
             )) : <p className="text-gray-500 italic text-sm">No custom questions added yet. Everyone can add some!</p>}
           </div>
           <form onSubmit={handleAddCustomQuestion} className="flex gap-2">
             <input
               type="text"
               value={customQuestion}
               onChange={(e) => setCustomQuestion(e.target.value)}
               placeholder="Add a fun question..."
               className="flex-1 p-2 rounded-lg text-black text-sm border border-transparent focus:border-[#A8E6CF] focus:outline-none"
             />
             <button type="submit" disabled={!customQuestion.trim()} className="bg-[#A8E6CF] text-black px-4 py-2 rounded-lg font-bold hover:bg-[#85e1b8] transition">Add</button>
           </form>
        </div>
      )}

      {state.isHost ? (
        <div className="fixed bottom-0 w-full bg-[#1A1A2E] p-4 border-t-2 border-[#FFE66D] flex flex-col items-center shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-50">
          <div className="flex space-x-4 mb-4">
             <select 
               value={state.mode} 
               onChange={(e) => handleOptionsChange('mode', e.target.value)}
               className="bg-[#0D0D1A] text-white p-2 rounded-lg border border-[#2D2D44] font-['Nunito'] w-1/2"
             >
                <option value="friends">Friends Mode</option>
                <option value="family">Family Mode</option>
                <option value="custom">Custom Mode</option>
             </select>
             <select 
               value={state.totalRounds} 
               onChange={(e) => handleOptionsChange('rounds', parseInt(e.target.value))}
               className="bg-[#0D0D1A] text-white p-2 rounded-lg border border-[#2D2D44] font-['Nunito'] w-1/2"
             >
                <option value={2}>2 Rounds</option>
                <option value={3}>3 Rounds</option>
                <option value={4}>4 Rounds</option>
                <option value={5}>5 Rounds</option>
             </select>
          </div>
          <button 
            disabled={state.players?.length < 3}
            onClick={handleStartGame}
            className={`w-full max-w-sm ${state.players?.length < 3 ? 'bg-gray-600 cursor-not-allowed' : 'bg-[#FFE66D] hover:bg-[#ffdd33] text-black'} font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-['Fredoka_One'] shadow-lg uppercase tracking-wide`}
          >
            Start Game
          </button>
        </div>
      ) : (
        <div className="fixed bottom-0 w-full bg-[#1A1A2E] p-6 border-t-2 border-[#FF6B6B] flex flex-col items-center shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-50">
            <p className="text-[#FF6B6B] font-['Fredoka_One'] text-xl animate-pulse">Waiting for host to start...</p>
        </div>
      )}
    </div>
  );
}

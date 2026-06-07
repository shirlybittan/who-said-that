import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { socket } from '../socket';
import { useGame } from '../store/gameStore.jsx';
import { translations } from '../locales/translations';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const defaultJoin = searchParams.get('join') || '';

  const [joinNickname, setJoinNickname] = useState('');
  const [roomCode, setRoomCode] = useState(defaultJoin);

  const { state, dispatch } = useGame();
  const t = translations[state.lang].home;
  const sounds = useSounds();

  // Clear any stale session from a previous game so the onConnect handler
  // in useSocket.js doesn't auto-rejoin a room that no longer exists and
  // doesn't show every new tab under the same old player name.
  useEffect(() => {
    localStorage.removeItem('wst_playerId');
    localStorage.removeItem('wst_roomCode');
    dispatch({ type: 'CLEAR_SESSION' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoinRoom = () => {
    if (!joinNickname.trim()) return alert('Please enter a nickname');
    if (!roomCode.trim() || roomCode.length !== 4) return alert('Enter a 4-letter room code');
    sounds.click();

    const code = roomCode.toUpperCase();

    localStorage.removeItem('wst_roomCode');
    localStorage.removeItem('wst_playerId');
    localStorage.setItem('wst_playerName', joinNickname.trim());

    if (socket.connected) {
      socket.emit('join_room', { code, playerName: joinNickname.trim(), playerId: null });
    } else {
      socket.connect();
      socket.emit('join_room', { code, playerName: joinNickname.trim(), playerId: null });
    }
  };

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-6 gap-6"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="text-center mb-2">
        <h1 className="text-5xl font-['Fredoka_One'] text-[#FFE66D] mb-2">🎉 Party Pack</h1>
        <p className="text-gray-400 font-['Nunito'] text-lg">{t.subtitle}</p>
      </div>

      {/* ── HOST A NEW GAME ── */}
      <a
        href="/host"
        className="w-full max-w-sm flex items-center gap-5 bg-[#1A1A2E] border-2 border-[#4ECDC4] rounded-3xl p-6 hover:bg-[#4ECDC4]/10 active:scale-[0.98] transition no-underline"
        style={{ boxShadow: '0 0 30px #4ECDC420' }}
        onClick={() => sounds.click?.()}
      >
        <span className="text-5xl">📺</span>
        <div className="flex-1 min-w-0">
          <p className="font-['Fredoka_One'] text-xl text-[#4ECDC4]">Host a New Game</p>
          <p className="font-['Nunito'] text-sm text-gray-400 leading-snug mt-1">
            Show this on a TV or big screen. Players join from their phones.
          </p>
        </div>
        <span className="text-[#4ECDC4] font-['Fredoka_One'] text-lg flex-shrink-0">→</span>
      </a>

      {/* ── DIVIDER ── */}
      <div className="flex items-center w-full max-w-sm">
        <div className="flex-1 border-t border-[#2D2D44]" />
        <span className="mx-4 text-gray-500 font-['Nunito'] text-sm uppercase">{t.or}</span>
        <div className="flex-1 border-t border-[#2D2D44]" />
      </div>

      {/* ── JOIN A GAME ── */}
      <div className="w-full max-w-sm bg-[#1A1A2E] border border-[#2D2D44] rounded-3xl p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">📱</span>
          <div>
            <p className="font-['Fredoka_One'] text-xl text-white">Join a Game</p>
            <p className="font-['Nunito'] text-xs text-gray-400">Enter the room code shown on the TV</p>
          </div>
        </div>
        <input
          type="text"
          placeholder={t.nickname}
          value={joinNickname}
          onChange={(e) => setJoinNickname(e.target.value)}
          maxLength={15}
          className="w-full p-3 rounded-xl text-black text-[16px] border-2 border-transparent focus:border-[#FFE66D] focus:outline-none"
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={t.joinPlaceholder}
            maxLength={4}
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            className="w-3/5 p-3 rounded-xl text-black text-center font-bold text-xl uppercase border-2 border-transparent focus:border-[#FFE66D] focus:outline-none min-w-0"
          />
          <button
            onClick={handleJoinRoom}
            className="w-2/5 bg-[#FFE66D] hover:bg-[#ffdd33] text-black font-bold py-3 px-2 rounded-xl transition active:scale-95 text-lg font-['Fredoka_One'] shadow-lg truncate"
          >
            {t.joinBtn}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { socket } from '../socket';
import { useGame } from '../store/gameStore.jsx';
import { translations } from '../locales/translations';
import { motion } from 'framer-motion';
import { useSounds } from '../hooks/useSounds';

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const defaultJoin = searchParams.get('join') || '';

  const [selectedGame, setSelectedGame] = useState('most-likely-to');

  const [joinNickname, setJoinNickname] = useState('');
  const [roomCode, setRoomCode] = useState(defaultJoin);

  const { state, dispatch } = useGame();
  const t = translations[state.lang].home;
  const navigate = useNavigate();
  const sounds = useSounds();

  const handleCreateRoom = () => {
    sounds.click();
    localStorage.removeItem('wst_roomCode');
    localStorage.removeItem('wst_playerId');

    const playerName = joinNickname.trim() || 'Player';
    const payload = { playerName, gameType: selectedGame, hostIsPlaying: true };
    if (socket.connected) {
      socket.emit('create_room', payload);
    } else {
      socket.connect();
      socket.emit('create_room', payload);
    }
  };

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

  const games = [
    {
      id: 'who-said-that',
      label: t?.gameWst || 'Who Said That?',
      desc: t?.gameWstDesc || 'Guess who wrote it!',
      accent: '#FFE66D',
      icon: '🤔',
    },
    {
      id: 'situational',
      label: t?.gameSit || 'Situational',
      desc: t?.gameSitDesc || 'Answer as if it was you!',
      accent: '#A8E6CF',
      icon: '🎭',
    },
    {
      id: 'this-or-that',
      label: t?.gameTot || 'This or That',
      desc: t?.gameTotDesc || 'Pick a side!',
      accent: '#6C5CE7',
      icon: '⚡',
    },
    {
      id: 'most-likely-to',
      label: t?.gameMlt || 'Most Likely To',
      desc: t?.gameMltDesc || 'Who fits the prompt?',
      accent: '#4ECDC4',
      icon: '👑',
    },
    {
      id: 'drawing',
      label: t?.gameDraw || 'Sketch It!',
      desc: t?.gameDrawDesc || 'Draw and vote for the best!',
      accent: '#C39BD3',
      icon: '🎨',
    },
    {
      id: 'mixed',
      label: t?.gameMixed || 'Mixed',
      desc: t?.gameMixedDesc || 'All modes shuffled!',
      accent: '#FF8B94',
      icon: '🎲',
    }
  ];

  const currentSelection = Array.isArray(selectedGame) ? selectedGame : [selectedGame];
  const accentColor = currentSelection.length > 1 ? '#FF8B94' : (games.find(g => g.id === currentSelection[0])?.accent || '#FF6B6B');

  return (
    <motion.div className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-4 text-center" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
      <h1 className="text-5xl font-['Fredoka_One'] mb-1 text-[#FFE66D]">🎉 Party Pack</h1>
      <p className="text-lg mb-8 font-['Nunito'] text-gray-400">{t.subtitle}</p>

      {/* ── CREATE GAME ── */}
      <div className="bg-[#1A1A2E] p-6 rounded-2xl shadow-xl w-full max-w-sm border border-[#2D2D44] mb-4">
        <p className="text-xs font-['Nunito'] uppercase tracking-widest text-gray-500 mb-4">{t.pickGame}</p>

        {/* Game Picker */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {games.map((g) => {
            const currentArr = Array.isArray(selectedGame) ? selectedGame : [selectedGame];
            const isSelected = currentArr.includes(g.id);
            return (
            <button
              key={g.id}
              onClick={() => setSelectedGame(current => {
                const arr = Array.isArray(current) ? current : [current];
                if (g.id === 'mixed') return ['mixed'];
                const noMixed = arr.filter(id => id !== 'mixed');
                const updated = noMixed.includes(g.id) ? noMixed.filter(id => id !== g.id) : [...noMixed, g.id];
                return updated.length ? updated : [g.id];
              })}
              className={`rounded-2xl p-4 border-2 text-left transition active:scale-95 ${
                isSelected
                  ? 'border-transparent shadow-lg scale-[1.02]'
                  : 'border-[#2D2D44] bg-[#0D0D1A]/60 hover:opacity-80'
              } ${g.id === 'mixed' ? 'col-span-2 text-center flex flex-col items-center justify-center' : 'flex flex-col'}`}
              style={isSelected ? { backgroundColor: g.accent + '22', borderColor: g.accent, boxShadow: `0 0 12px ${g.accent}44` } : {}}
            >
              <span className="text-3xl mb-1">{g.icon}</span>
              <p className="font-['Fredoka_One'] text-sm leading-tight" style={isSelected ? { color: g.accent } : { color: '#ccc' }}>
                {g.label}
              </p>
              <p className="font-['Nunito'] text-xs text-gray-400 mt-1 leading-snug">{g.desc}</p>
            </button>
            );
          })}
        </div>

        <input
          type="text"
          placeholder={t.nickname}
          value={joinNickname}
          onChange={(e) => setJoinNickname(e.target.value)}
          maxLength={15}
          className="w-full p-3 rounded-lg text-black mb-4 text-[16px] border-2 border-transparent focus:border-[#FFE66D] focus:outline-none"
        />

        <button
          onClick={handleCreateRoom}
          className="w-full font-bold py-3 px-4 rounded-lg transition transform active:scale-95 text-lg font-['Fredoka_One'] shadow-lg text-white"
          style={{ backgroundColor: accentColor }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
          onMouseLeave={e => e.currentTarget.style.filter = ''}
        >
          {t.createBtn}
        </button>
      </div>

      {/* ── OR divider ── */}
      <div className="flex items-center w-full max-w-sm mb-4">
        <div className="flex-1 border-t border-[#2D2D44]" />
        <span className="mx-4 text-gray-400 font-['Nunito'] text-sm uppercase">{t.or}</span>
        <div className="flex-1 border-t border-[#2D2D44]" />
      </div>

      {/* ── JOIN GAME ── */}
      <div className="bg-[#1A1A2E] p-6 rounded-2xl shadow-xl w-full max-w-sm border border-[#2D2D44]">
        <p className="text-xs font-['Nunito'] uppercase tracking-widest text-gray-500 mb-4">{t.joinTitle || 'Join a game'}</p>
        <input
          type="text"
          placeholder={t.nickname}
          value={joinNickname}
          onChange={(e) => setJoinNickname(e.target.value)}
          className="w-full p-3 rounded-lg text-black mb-3 text-[16px] border-2 border-transparent focus:border-[#FFE66D] focus:outline-none"
        />
        <div className="flex gap-2 w-full">
          <input
            type="text"
            placeholder={t.joinPlaceholder}
            maxLength={4}
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            className="w-3/5 p-3 rounded-lg text-black text-center font-bold text-xl uppercase border-2 border-transparent focus:border-[#FFE66D] focus:outline-none min-w-0"
          />
          <button
            onClick={handleJoinRoom}
            className="w-2/5 bg-[#FFE66D] hover:bg-[#ffdd33] text-black font-bold py-3 px-2 rounded-lg transition transform active:scale-95 text-lg font-['Fredoka_One'] shadow-lg truncate"
          >
            {t.joinBtn}
          </button>
        </div>
      </div>

      {/* ── TV MODE CTA ── */}
      <div className="flex items-center gap-4 w-full max-w-sm bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-4">
        <span className="text-3xl">📺</span>
        <div className="flex-1 min-w-0">
          <p className="font-['Fredoka_One'] text-sm text-[#4ECDC4]">Playing on a TV?</p>
          <p className="text-xs font-['Nunito'] text-gray-400">Create the room from the big screen</p>
        </div>
        <a
          href="/host"
          className="flex-shrink-0 px-4 py-2 bg-[#4ECDC4]/20 border border-[#4ECDC4]/40 rounded-xl font-['Fredoka_One'] text-[#4ECDC4] text-sm hover:bg-[#4ECDC4]/30 transition"
        >
          TV Mode →
        </a>
      </div>
    </motion.div>
  );
}

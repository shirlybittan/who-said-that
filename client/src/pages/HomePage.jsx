import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { socket } from '../socket';
import { useGame } from '../store/gameStore.jsx';
import { translations } from '../locales/translations';

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const defaultJoin = searchParams.get('join') || '';

  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState(defaultJoin);

  const { state, dispatch } = useGame();
  const t = translations[state.lang].home;
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!nickname.trim()) return alert('Please enter a nickname');

    localStorage.removeItem('wst_roomCode');
    localStorage.removeItem('wst_playerId');
    localStorage.setItem('wst_playerName', nickname.trim());

    if (socket.connected) {
      socket.emit('create_room', { playerName: nickname.trim() });
    } else {
      socket.connect();
      socket.emit('create_room', { playerName: nickname.trim() });
    }
  };

  const handleJoinRoom = () => {
    if (!nickname.trim()) return alert('Please enter a nickname');
    if (!roomCode.trim() || roomCode.length !== 4) return alert('Enter a 4-letter room code');

    const code = roomCode.toUpperCase();

    localStorage.removeItem('wst_roomCode');
    localStorage.removeItem('wst_playerId');
    localStorage.setItem('wst_playerName', nickname.trim());

    if (socket.connected) {
      socket.emit('join_room', { code, playerName: nickname.trim(), playerId: null });
    } else {
      socket.connect();
      socket.emit('join_room', { code, playerName: nickname.trim(), playerId: null });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-4 text-center">
      <h1 className="text-5xl font-['Fredoka_One'] mb-2 text-[#FF6B6B]">{t.title}</h1>
      <p className="text-lg mb-8 font-['Nunito'] text-gray-300">{t.subtitle}</p>

      <div className="bg-[#1A1A2E] p-6 rounded-2xl shadow-xl w-full max-w-sm border border-[#2D2D44]">
        <input
          type="text"
          placeholder={t.nickname}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="w-full p-3 rounded-lg text-black mb-6 text-[16px] border-2 border-transparent focus:border-[#FF6B6B] focus:outline-none"
        />

        <button
          onClick={handleCreateRoom}
          className="w-full bg-[#FF6B6B] hover:bg-[#ff5252] text-white font-bold py-3 px-4 rounded-lg mb-6 transition transform active:scale-95 text-lg font-['Fredoka_One'] shadow-lg"
        >
          {t.createBtn}
        </button>

        <div className="flex items-center my-4 before:flex-1 before:border-t before:border-[#2D2D44] after:flex-1 after:border-t after:border-[#2D2D44]">       
          <span className="mx-4 text-gray-400 font-['Nunito'] text-sm uppercase">{t.or}</span>
        </div>

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

      <div className="mt-12 bg-[#1A1A2E] p-6 rounded-2xl shadow-xl w-full max-w-xl border border-[#2D2D44] text-left">
        <h2 className="text-2xl font-bold font-['Fredoka_One'] text-[#FFE66D] mb-4">{t.howToTitle}</h2>
        <ul className="text-gray-300 font-['Nunito'] space-y-3 text-lg leading-relaxed">
          <li><strong className="text-white">{t.rule1Title}</strong> {t.rule1Desc}</li>       
          <li><strong className="text-white">{t.rule2Title}</strong> {t.rule2Desc}</li>
          <li><strong className="text-white">{t.rule3Title}</strong>        
            <ul className="list-disc pl-6 mt-1 space-y-1 text-[#A8E6CF]">       
              <li><span className="text-[#FF6B6B] font-bold">{t.point1}</span></li>
              <li><span className="text-[#FFE66D] font-bold">{t.point0}</span></li>
              <li><span className="text-[#FF6B6B] font-bold">{t.pointMinus1}</span></li>
            </ul>
          </li>
          <li><strong className="text-white">{t.rule4Title}</strong> {t.rule4Desc}</li>
        </ul>
      </div>
    </div>
  );
}

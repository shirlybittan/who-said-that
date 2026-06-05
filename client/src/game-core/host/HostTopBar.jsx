import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function HostTopBar({ roomCode, showQr, joinUrl, onCopyHostUrl, onChangeGame, onMainMenu }) {
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-[#1A1A2E] border-b border-[#2D2D44] flex-shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xl font-['Fredoka_One'] text-[#FFE66D]">🎉 Party Pack</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-['Nunito'] text-gray-500 uppercase tracking-widest">Room</span>
          <span className="text-2xl font-['Fredoka_One'] text-[#FFE66D] tracking-widest">{roomCode}</span>
        </div>
        {showQr && joinUrl ? (
          <div className="bg-white p-1 rounded">
            <QRCodeSVG value={joinUrl} size={36} />
          </div>
        ) : null}
        {roomCode ? (
          <button
            onClick={onCopyHostUrl}
            title="Copy host URL"
            className="px-3 py-1 rounded-lg text-xs font-['Nunito'] border border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] active:scale-95 transition"
          >
            📋 Host URL
          </button>
        ) : null}
        {onChangeGame ? (
          <button
            onClick={onChangeGame}
            className="px-3 py-1 rounded-lg text-xs font-['Fredoka_One'] border border-[#2D2D44] text-gray-400 hover:border-[#4ECDC4] hover:text-[#4ECDC4] active:scale-95 transition"
          >
            🎮 Change Game
          </button>
        ) : null}
        {onMainMenu ? (
          <button
            onClick={onMainMenu}
            className="px-3 py-1 rounded-lg text-xs font-['Fredoka_One'] border border-[#2D2D44] text-gray-400 hover:border-[#FF6B6B] hover:text-[#FF6B6B] active:scale-95 transition"
          >
            🏠 Main Menu
          </button>
        ) : null}
      </div>
    </div>
  );
}

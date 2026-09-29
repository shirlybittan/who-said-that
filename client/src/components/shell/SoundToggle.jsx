import React, { useState } from 'react';
import { soundManager } from '../../sounds/SoundManager';

/** Mute / unmute game sounds. Inline (placed by the top bars), never floating. */
export default function SoundToggle() {
  const [muted, setMuted] = useState(() => soundManager.muted);
  const handleToggle = () => {
    const nowMuted = soundManager.toggleMute();
    setMuted(nowMuted);
    if (!nowMuted) soundManager.playClick();
  };
  return (
    <button
      onClick={handleToggle}
      title={muted ? 'Unmute sounds' : 'Mute sounds'}
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      className="bg-[#2D2D44] text-white w-9 h-8 rounded-full text-sm font-bold border border-gray-600 hover:bg-[#4ECDC4] hover:text-black transition"
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

import React from 'react';
import TimerRing from '../../components/game/TimerRing';
import { useRoundTimer } from '../hooks/useRoundTimerSync';

/**
 * The one on-screen round timer for players. Rendered by the app shell
 * (PlayerTopBar), so every game gets it by default — pages must not draw
 * their own countdown.
 */
export default function GameTimer({ size = 44 }) {
  const { visible, secondsLeft, total, paused } = useRoundTimer();
  if (!visible) return null;
  return (
    <div data-testid="game-timer" aria-label={paused ? 'Timer paused' : `${secondsLeft} seconds left`}>
      <TimerRing secondsLeft={secondsLeft} total={total} paused={paused} size={size} />
    </div>
  );
}

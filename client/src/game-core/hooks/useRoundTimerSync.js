import { useEffect, useState } from 'react';
import { useGame } from '../../store/gameStore.jsx';
import { isTimerVisible } from '../roundTimer';

/**
 * The canonical round timer: { visible, secondsLeft, total, paused }.
 * Re-evaluates once a second so a timer the server stopped silently (no final
 * 0 tick) disappears instead of freezing on screen.
 */
export function useRoundTimer() {
  const { state } = useGame();
  const timer = state.roundTimer;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return {
    visible: isTimerVisible(timer, now),
    secondsLeft: timer?.secondsLeft || 0,
    total: timer?.total || 30,
    paused: !!timer?.paused,
  };
}

// Back-compat alias (the old unused normaliser).
export const useRoundTimerSync = useRoundTimer;

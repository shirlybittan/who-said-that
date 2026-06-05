import { useMemo } from 'react';

export function useRoundTimerSync(timer) {
  return useMemo(() => ({
    secondsLeft: Math.max(0, Number(timer?.secondsLeft || 0)),
    paused: !!timer?.paused,
    total: Number(timer?.total || 30),
  }), [timer?.secondsLeft, timer?.paused, timer?.total]);
}

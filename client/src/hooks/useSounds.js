import { useCallback } from 'react';
import { soundManager } from '../sounds/SoundManager';

/**
 * useSounds() — thin wrapper that exposes named play functions.
 * All calls are no-ops if the AudioContext is not yet unlocked or sounds are muted.
 */
export function useSounds() {
  const click      = useCallback(() => soundManager.playClick(),      []);
  const success    = useCallback(() => soundManager.playSuccess(),    []);
  const tick       = useCallback(() => soundManager.playTick(),       []);
  const tickUrgent = useCallback(() => soundManager.playTickUrgent(), []);
  const reveal     = useCallback(() => soundManager.playReveal(),     []);
  const vote       = useCallback(() => soundManager.playVote(),       []);
  const roundEnd   = useCallback(() => soundManager.playRoundEnd(),   []);
  const gameEnd    = useCallback(() => soundManager.playGameEnd(),    []);
  const joker      = useCallback(() => soundManager.playJoker(),      []);
  const error      = useCallback(() => soundManager.playError(),      []);
  const draw       = useCallback(() => soundManager.playDraw(),       []);
  const join       = useCallback(() => soundManager.playJoin(),       []);

  return { click, success, tick, tickUrgent, reveal, vote, roundEnd, gameEnd, joker, error, draw, join };
}

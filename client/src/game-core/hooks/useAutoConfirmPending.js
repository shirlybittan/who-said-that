import { useEffect, useRef } from 'react';
import { useGame } from '../../store/gameStore.jsx';

/**
 * Canonical behaviour at 0 (AUDIT.md §6.1 "Timer"): a pick the player chose but
 * didn't confirm is submitted on the round timer's last second — it used to be
 * silently lost in every voting game (P2-14). Driven by the shared roundTimer,
 * so it works the same in every game.
 *
 * @param {{ pending: any, hasVoted: boolean, onConfirm: () => void }} opts
 */
export default function useAutoConfirmPending({ pending, hasVoted, onConfirm }) {
  const { state } = useGame();
  const { secondsLeft, at, paused } = state.roundTimer || {};
  const sentRef = useRef(false);
  const confirmRef = useRef(onConfirm);
  useEffect(() => { confirmRef.current = onConfirm; });
  useEffect(() => { sentRef.current = false; }, [pending]);

  useEffect(() => {
    if (sentRef.current || hasVoted || pending == null || paused || !at) return;
    if (secondsLeft <= 1) {
      sentRef.current = true;
      confirmRef.current?.();
    }
  }, [secondsLeft, at, paused, pending, hasVoted]);
}

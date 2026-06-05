import { useState, useEffect, useCallback } from 'react';

/**
 * useMiniGameLifecycle — manages the Input → Confirm → Waiting lifecycle
 * that is shared across all mini-game input phases.
 *
 * @param {Function} onSubmit        Called when the player clicks Confirm
 * @param {*}        resetKey        When this value changes, confirmed state is reset
 *                                   (e.g. pass `state.currentQuestion` or `fitb.question`)
 * @param {boolean}  initialConfirmed Start in the confirmed/waiting state — use when
 *                                   restoring a reconnecting player who already submitted.
 */
export function useMiniGameLifecycle({ onSubmit, resetKey, initialConfirmed = false } = {}) {
  const [hasConfirmed, setHasConfirmed] = useState(!!initialConfirmed);

  // Reset whenever the prompt / round changes
  useEffect(() => {
    setHasConfirmed(false);
  }, [resetKey]);

  /** Calls onSubmit then locks the UI into the waiting phase. */
  const confirm = useCallback(() => {
    if (typeof onSubmit === 'function') onSubmit();
    setHasConfirmed(true);
  }, [onSubmit]);

  /** Returns the UI to the input phase without re-calling onSubmit. */
  const editResponse = useCallback(() => {
    setHasConfirmed(false);
  }, []);

  /**
   * Marks the submission as confirmed without calling onSubmit.
   * Useful for timer-driven auto-submits where the socket.emit is
   * handled externally.
   */
  const markConfirmed = useCallback(() => {
    setHasConfirmed(true);
  }, []);

  return { hasConfirmed, confirm, editResponse, markConfirmed };
}

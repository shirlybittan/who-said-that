import React, { useLayoutEffect, useRef, useState } from 'react';
import WaitingFor from '../game-core/player/WaitingFor';
import { useGame } from '../store/gameStore.jsx';
import { translations } from '../locales/translations';

/**
 * MiniGameWrapper — the canonical Input → Confirm → Waiting lifecycle for every
 * mini-game input phase (text answers, prompts, captions, drawings).
 *
 * Lifecycle:
 *   Input phase   (!hasConfirmed): children + Confirm button
 *   Waiting phase (hasConfirmed):  children (locked) + waiting message +
 *                                  who we're waiting for + Edit button
 *
 * Canonical rules (AUDIT.md §6.1 "Confirm / submit"):
 *   - Confirm is disabled while `value` is empty/whitespace (or disableConfirm).
 *   - After Confirm the inputs inside are locked (a <fieldset disabled>) until
 *     the player presses Edit — typing into a submitted box used to be silently
 *     discarded, and Enter could re-submit. Canvas games that keep drawing after
 *     submitting pass lockWhenConfirmed={false}.
 *   - Edit is only offered when the game allows changing a submitted answer
 *     (onEditResponse provided).
 *
 * Props:
 *   hasConfirmed, onConfirm, onEditResponse, onChangePrompt, isHost
 *   value              current input value (text phases) — enables the empty check
 *   disableConfirm     extra condition (e.g. no strokes yet, no [name] in prompt)
 *   lockWhenConfirmed  default true
 *   confirmLabel / editLabel / waitingMessage — override translated defaults
 */
export default function MiniGameWrapper({
  hasConfirmed,
  onConfirm,
  onEditResponse,
  onChangePrompt,
  confirmLabel,
  editLabel,
  disableConfirm = false,
  value,
  lockWhenConfirmed = true,
  isHost = false,
  waitingMessage,
  children,
}) {
  const { state } = useGame();
  const t = translations[state.lang]?.common || translations.en.common;
  // Empty check by default: use `value` when given, otherwise read the text
  // input/textarea inside the wrapper (canvas phases have none → never empty).
  const fieldsetRef = useRef(null);
  const [domEmpty, setDomEmpty] = useState(false);
  useLayoutEffect(() => {
    if (typeof value === 'string') return undefined;
    const el = fieldsetRef.current;
    const read = () => {
      const field = el?.querySelector('textarea, input[type=text], input:not([type])');
      setDomEmpty(!!field && field.value.trim().length === 0);
    };
    read();
    el?.addEventListener('input', read);
    return () => el?.removeEventListener('input', read);
  });
  const isEmpty = typeof value === 'string' ? value.trim().length === 0 : domEmpty;
  const confirmDisabled = disableConfirm || isEmpty;

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <fieldset ref={fieldsetRef} disabled={hasConfirmed && lockWhenConfirmed} className="w-full flex flex-col items-center min-w-0 border-0 p-0 m-0">
        {children}
      </fieldset>

      {!hasConfirmed ? (
        /* ── Input Phase ─────────────────────────────────────────────── */
        <button
          data-testid="player-answer-submit"
          onClick={() => { if (!confirmDisabled) onConfirm?.(); }}
          disabled={confirmDisabled}
          className={`w-full max-w-sm py-4 rounded-2xl font-['Fredoka_One'] text-xl uppercase shadow-lg transition active:scale-95 ${
            confirmDisabled
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-[#FFE66D] text-black hover:bg-[#ffdd33]'
          }`}
        >
          {confirmLabel || t.submit}
        </button>
      ) : (
        /* ── Waiting Phase ───────────────────────────────────────────── */
        <div data-testid="player-waiting" className="w-full max-w-sm flex flex-col items-center gap-3">
          <p className="text-[#4ECDC4] font-['Nunito'] text-sm text-center animate-pulse">
            ✓ {waitingMessage || t.waitingOthers}
          </p>
          <WaitingFor />
          {onEditResponse && (
            <button
              onClick={onEditResponse}
              className="w-full py-3 rounded-2xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] transition active:scale-95"
            >
              {editLabel || t.edit}
            </button>
          )}
        </div>
      )}

      {/* Change Prompt: only shown when host provides a handler */}
      {isHost && onChangePrompt && (
        <button
          onClick={onChangePrompt}
          className="mt-1 text-sm text-gray-500 font-['Nunito'] underline hover:text-white transition"
        >
          🔄 Change Prompt
        </button>
      )}
    </div>
  );
}

import React from 'react';

/**
 * MiniGameWrapper — enforces a unified Input → Confirm → Waiting lifecycle
 * for every mini-game input phase.
 *
 * Lifecycle:
 *   Input/Edit Phase  (!hasConfirmed): renders children + Confirm button
 *   Waiting Phase     (hasConfirmed):  renders children + waiting message + Edit Response button
 *
 * The Change Prompt button is rendered below the action area for hosts only.
 *
 * Props:
 *   hasConfirmed   {boolean}   Whether the player has confirmed their response
 *   onConfirm      {Function}  Called when Confirm is clicked
 *   onEditResponse {Function}  Called when Edit Response is clicked
 *   onChangePrompt {Function}  (optional) Called when Change Prompt is clicked — only visible to hosts
 *   confirmLabel   {string}    Label for the Confirm button (default "✓ Confirm")
 *   disableConfirm {boolean}   Whether the Confirm button is disabled
 *   isHost         {boolean}   Whether the current player is the host
 *   waitingMessage {string}    Text shown in the waiting phase
 *   children       {ReactNode} The raw input content (textarea / canvas / etc.)
 */
export default function MiniGameWrapper({
  hasConfirmed,
  onConfirm,
  onEditResponse,
  onChangePrompt,
  confirmLabel = '✓ Confirm',
  editLabel = '✏️ Edit Response',
  disableConfirm = false,
  isHost = false,
  waitingMessage = 'Waiting for other players…',
  children,
}) {
  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* Input content: always rendered so players can keep editing */}
      {children}

      {!hasConfirmed ? (
        /* ── Input Phase ─────────────────────────────────────────────── */
        <button
          onClick={onConfirm}
          disabled={disableConfirm}
          className={`w-full max-w-sm py-4 rounded-2xl font-['Fredoka_One'] text-xl uppercase shadow-lg transition active:scale-95 ${
            disableConfirm
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-[#FFE66D] text-black hover:bg-[#ffdd33]'
          }`}
        >
          {confirmLabel}
        </button>
      ) : (
        /* ── Waiting Phase ───────────────────────────────────────────── */
        <div className="w-full max-w-sm flex flex-col items-center gap-3">
          <p className="text-[#4ECDC4] font-['Nunito'] text-sm text-center animate-pulse">
            ✓ {waitingMessage}
          </p>
          <button
            onClick={onEditResponse}
            className="w-full py-3 rounded-2xl font-['Fredoka_One'] text-base border-2 border-[#2D2D44] text-gray-400 hover:border-[#FFE66D] hover:text-[#FFE66D] transition active:scale-95"
          >
            {editLabel}
          </button>
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

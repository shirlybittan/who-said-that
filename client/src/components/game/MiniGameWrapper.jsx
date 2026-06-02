import React, { useState } from 'react';

export default function MiniGameWrapper({
  mode,
  onConfirm,
  onEditResponse,
  waitingLabel = 'Waiting for other players...',
  confirmLabel = 'Confirm',
  editLabel = 'Edit Response',
  isHost = false,
  adminControls = null,
  children,
}) {
  const [isConfirmed, setIsConfirmed] = useState(false);

  const handleConfirm = () => {
    if (isConfirmed) return;
    onConfirm?.();
    setIsConfirmed(true);
  };

  const handleEditResponse = () => {
    setIsConfirmed(false);
    onEditResponse?.();
  };

  return (
    <section data-testid="mini-game-wrapper" data-mode={mode}>
      <div data-testid="mini-game-content" aria-disabled={isConfirmed}>
        {typeof children === 'function' ? children({ isConfirmed }) : children}
      </div>

      {!isConfirmed ? (
        <button type="button" onClick={handleConfirm}>
          {confirmLabel}
        </button>
      ) : (
        <div>
          <p>{waitingLabel}</p>
          <button type="button" onClick={handleEditResponse}>
            {editLabel}
          </button>
        </div>
      )}

      {isHost && adminControls ? <div data-testid="admin-controls">{adminControls}</div> : null}
    </section>
  );
}

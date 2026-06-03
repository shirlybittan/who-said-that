import { describe, it, expect, vi } from 'vitest';
import { buildHostControls } from '../hostControls';

describe('buildHostControls', () => {
  it('shows skip button in lobby when playlist has a next game', () => {
    const onSkipMiniGame = vi.fn();
    const controls = buildHostControls({
      playingCount: 3,
      gameQueue: [{ type: 'caption' }, { type: 'drawing' }],
      queueIndex: 0,
      handlers: { onStart: vi.fn(), onSkipMiniGame },
    });

    const labels = controls.lobby.map((btn) => btn.label);
    expect(labels).toContain('▶ Start Game');
    expect(labels).toContain('🔀 Skip Mini Game');
  });
});

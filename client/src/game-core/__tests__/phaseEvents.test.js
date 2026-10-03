import { describe, it, expect } from 'vitest';
import { phaseForEvent } from '../phaseEvents';

describe('phaseForEvent', () => {
  it('maps the first event of a photo game that skipped its photo step', () => {
    expect(phaseForEvent('caption:writing_phase')).toBe('caption');
    expect(phaseForEvent('selfie:draw_assigned')).toBe('selfie');
    expect(phaseForEvent('photovote:voting_phase')).toBe('photovote');
  });
  it('maps game-over events to their End phases', () => {
    expect(phaseForEvent('caption:game_over')).toBe('captionEnd');
    expect(phaseForEvent('photovote:game_over')).toBe('photovoteEnd');
  });
  it('ignores events that do not imply a phase', () => {
    expect(phaseForEvent('caption:vote_received')).toBeNull();
  });
});

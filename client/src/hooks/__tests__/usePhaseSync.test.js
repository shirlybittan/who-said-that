import { describe, it, expect } from 'vitest';
import { computeReconcileTarget } from '../usePhaseSync';

// Minimal state factory
const S = (over = {}) => ({ roomCode: 'ABCD', phase: 'question', joinedMidRound: false, ...over });

describe('computeReconcileTarget', () => {
  it('returns null when not in a game', () => {
    expect(computeReconcileTarget(S({ roomCode: null }), '/question')).toBeNull();
    expect(computeReconcileTarget(S({ phase: null }), '/question')).toBeNull();
    expect(computeReconcileTarget(S({ phase: 'home' }), '/question')).toBeNull();
  });

  it('never touches the home or host/TV screens', () => {
    expect(computeReconcileTarget(S({ phase: 'voting' }), '/')).toBeNull();
    expect(computeReconcileTarget(S({ phase: 'voting' }), '/host')).toBeNull();
  });

  it('leaves a brand-new mid-round joiner parked in the lobby', () => {
    expect(computeReconcileTarget(S({ phase: 'voting', joinedMidRound: true }), '/lobby')).toBeNull();
  });

  it('does nothing while the screen is already valid for the phase', () => {
    expect(computeReconcileTarget(S({ phase: 'question' }), '/question')).toBeNull();
    expect(computeReconcileTarget(S({ phase: 'drawing' }), '/draw')).toBeNull();
    // both mlt sub-routes count as valid → no fighting sub-phase nav
    expect(computeReconcileTarget(S({ phase: 'mlt', mlt: { roundState: 'voting' } }), '/mlt-vote')).toBeNull();
    expect(computeReconcileTarget(S({ phase: 'mlt', mlt: { roundState: 'results' } }), '/mlt-results')).toBeNull();
  });

  it('rescues a player stranded on a screen from a different phase', () => {
    expect(computeReconcileTarget(S({ phase: 'voting' }), '/question')).toBe('/vote');
    expect(computeReconcileTarget(S({ phase: 'drawing' }), '/lobby')).toBe('/draw');
    expect(computeReconcileTarget(S({ phase: 'roundEnd' }), '/vote')).toBe('/round-end');
    expect(computeReconcileTarget(S({ phase: 'gameEnd' }), '/round-end')).toBe('/game-end');
  });

  it('resolves sub-phase to the correct route when rescuing mlt', () => {
    expect(computeReconcileTarget(S({ phase: 'mlt', mlt: { roundState: 'voting' } }), '/question')).toBe('/mlt-vote');
    expect(computeReconcileTarget(S({ phase: 'mlt', mlt: { roundState: 'results' } }), '/question')).toBe('/mlt-results');
  });

  it('resolves dt turn/wait correctly when rescuing', () => {
    const drawingTurn = { phase: 'drawing', currentTurn: { promptId: 'p1' } };
    expect(computeReconcileTarget(S({ phase: 'dt', dt: drawingTurn }), '/lobby')).toBe('/draw-tel-draw');
    const drawingNoTurn = { phase: 'drawing', currentTurn: null };
    expect(computeReconcileTarget(S({ phase: 'dt', dt: drawingNoTurn }), '/lobby')).toBe('/draw-tel-wait');
    const guessTurn = { phase: 'guessing', guessTurn: { promptId: 'p1' } };
    expect(computeReconcileTarget(S({ phase: 'dt', dt: guessTurn }), '/lobby')).toBe('/draw-tel-guess');
  });

  it('treats the dt selfie sub-phase route as valid (no false rescue)', () => {
    expect(computeReconcileTarget(S({ phase: 'dt', dt: { phase: 'selfie' } }), '/selfie-photo')).toBeNull();
  });

  it('ignores unknown phases rather than guessing', () => {
    expect(computeReconcileTarget(S({ phase: 'totally-new-game' }), '/question')).toBeNull();
  });
});

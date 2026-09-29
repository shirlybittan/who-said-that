import { describe, it, expect } from 'vitest';
import { progressActionFor, roundProgressReducer, initialRoundProgress, pendingPlayers } from '../roundProgress';

describe('round progress', () => {
  it('any "*PlayerIds" payload updates the done list', () => {
    for (const [ev, key] of [['answer_received', 'answeredPlayerIds'], ['mlt:vote_received', 'votedPlayerIds'], ['caption:caption_submitted', 'submittedPlayerIds'], ['dt:guess_received', 'guessedPlayerIds']]) {
      const a = progressActionFor(ev, { [key]: ['a', 'b'] });
      expect(roundProgressReducer(initialRoundProgress, a).doneIds).toEqual(['a', 'b']);
    }
  });
  it('phase-start events reset it', () => {
    for (const ev of ['new_question', 'voting_started', 'next_answer', 'mlt:prompt', 'caption:writing_phase', 'draw:round_start', 'fitb:results']) {
      expect(progressActionFor(ev, {})).toEqual({ type: 'ROUND_PROGRESS_RESET' });
    }
  });
  it('lists expected players who are still pending (not me, not late joiners)', () => {
    const players = [
      { id: 'me', name: 'Me', isPlaying: true, isConnected: true },
      { id: 'a', name: 'A', isPlaying: true, isConnected: true },
      { id: 'b', name: 'B', isPlaying: true, isConnected: true },
      { id: 'tv', name: 'TV', isPlaying: false, isConnected: true },
      { id: 'late', name: 'L', isPlaying: true, isConnected: true, joinedMidRound: true },
    ];
    expect(pendingPlayers(players, ['a'], { excludeId: 'me' }).map(p => p.id)).toEqual(['b']);
  });
});

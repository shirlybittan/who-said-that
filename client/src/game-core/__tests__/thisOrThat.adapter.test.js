import { describe, expect, it, vi } from 'vitest';
import { thisOrThatAdapter } from '../adapters/thisOrThat.adapter';

describe('thisOrThatAdapter', () => {
  it('maps host frame with voting state', () => {
    const frame = thisOrThatAdapter.selectHostFrame({
      roomCode: 'TEST',
      joinUrl: 'http://localhost:5173/?join=TEST',
      tot: {
        question: 'Coffee or Tea?',
        a: 'Coffee',
        b: 'Tea',
        round: 1,
        totalRounds: 3,
        voteCount: 2,
        totalVoters: 4,
        votedPlayerIds: ['p1', 'p2'],
        secondsLeft: 20,
        paused: false,
        resultsVisible: false,
      },
      players: [
        { id: 'p1', name: 'Alice', color: '#f00', isPlaying: true, isConnected: true },
        { id: 'p2', name: 'Bob', color: '#0f0', isPlaying: true, isConnected: true },
        { id: 'p3', name: 'Cara', color: '#00f', isPlaying: true, isConnected: true },
        { id: 'p4', name: 'Dan', color: '#fff', isPlaying: true, isConnected: true },
      ],
    });

    expect(frame.roomCode).toBe('TEST');
    expect(frame.prompt).toBe('Coffee or Tea?');
    expect(frame.a).toBe('Coffee');
    expect(frame.b).toBe('Tea');
    expect(frame.roundLabel).toBe('Round 1 of 3');
    expect(frame.resultsVisible).toBe(false);
    expect(frame.playerStatuses[0].status).toBe('voted');
    expect(frame.playerStatuses[2].status).toBe('waiting');
  });

  it('exposes resultsVisible when results are showing', () => {
    const frame = thisOrThatAdapter.selectHostFrame({
      tot: {
        resultsVisible: true,
        pctA: 60,
        pctB: 40,
        countA: 3,
        countB: 2,
        majorityChoice: 'a',
      },
      players: [],
    });

    expect(frame.resultsVisible).toBe(true);
    expect(frame.majorityChoice).toBe('a');
    expect(frame.pctA).toBe(60);
    expect(frame.pctB).toBe(40);
  });

  it('emits tot:change_question (not tot:skip) for changeQuestion', () => {
    const emit = vi.fn();
    const actions = thisOrThatAdapter.createHostActions({
      socket: { emit },
      roomCode: 'ROOM1',
    });

    actions.changeQuestion();
    expect(emit).toHaveBeenCalledWith('tot:change_question', { code: 'ROOM1' });
    expect(emit).not.toHaveBeenCalledWith('tot:skip', expect.anything());
  });

  it('emits tot:next_round for nextRound action', () => {
    const emit = vi.fn();
    const actions = thisOrThatAdapter.createHostActions({
      socket: { emit },
      roomCode: 'ROOM1',
    });

    actions.nextRound();
    expect(emit).toHaveBeenCalledWith('tot:next_round', { code: 'ROOM1' });
  });
});

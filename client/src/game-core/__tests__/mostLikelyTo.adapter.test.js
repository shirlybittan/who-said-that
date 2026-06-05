import { describe, expect, it, vi } from 'vitest';
import { mostLikelyToAdapter } from '../adapters/mostLikelyTo.adapter';

describe('mostLikelyToAdapter', () => {
  it('maps host frame with vote progress and player statuses', () => {
    const frame = mostLikelyToAdapter.selectHostFrame({
      roomCode: 'ABCD',
      joinUrl: 'http://localhost:5173/?join=ABCD',
      mlt: {
        prompt: 'win karaoke?',
        round: 2,
        totalRounds: 5,
        voteCount: 3,
        totalVoters: 4,
        votedPlayerIds: ['p1'],
        secondsLeft: 19,
        paused: false,
      },
      players: [
        { id: 'p1', name: 'Maya', color: '#fff', isPlaying: true, isConnected: true },
        { id: 'p2', name: 'Noa', color: '#000', isPlaying: true, isConnected: true },
      ],
    });

    expect(frame.roomCode).toBe('ABCD');
    expect(frame.prompt).toBe('win karaoke?');
    expect(frame.progress).toEqual({ current: 3, total: 4, label: 'votes in' });
    expect(frame.playerStatuses[0].status).toBe('voted');
    expect(frame.playerStatuses[1].status).toBe('waiting');
  });

  it('creates player actions with same socket event contract', () => {
    const emit = vi.fn();
    const dispatch = vi.fn();
    const actions = mostLikelyToAdapter.createPlayerActions({
      socket: { emit },
      roomCode: 'ROOM1',
      dispatch,
      context: { sounds: { vote: vi.fn(), joker: vi.fn(), click: vi.fn() } },
    });

    actions.submitChoice({ id: 'p1' });
    actions.toggleJoker();

    expect(emit).toHaveBeenCalledWith('mlt:vote', { code: 'ROOM1', targetPlayerId: 'p1' });
    expect(emit).toHaveBeenCalledWith('mlt:toggle_joker', { code: 'ROOM1' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'MLT_MARK_VOTED', payload: { votedPlayerId: 'p1' } });
  });
});

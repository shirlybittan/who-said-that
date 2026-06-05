import { describe, expect, it } from 'vitest';
import { buildJoinRestorePlan, getRouteForPhase } from '../rejoinState';

const players = [
  { id: 'p1', name: 'Alice', color: '#f00', isConnected: true, isPlaying: true },
  { id: 'p2', name: 'Bob', color: '#0f0', isConnected: true, isPlaying: true },
  { id: 'p3', name: 'Cara', color: '#00f', isConnected: true, isPlaying: true },
];

const baseRoom = {
  code: 'ABCD',
  host: 'p1',
  phase: 'lobby',
  mode: 'friends',
  totalRounds: 3,
  currentRound: 1,
  players,
  gameType: 'mixed',
  selectedSubGames: [],
  gameName: 'Party',
  scores: {},
  roomConfig: {},
  globalScores: {},
  mlt: { totalRounds: 5, allowSelfVote: false },
};

describe('getRouteForPhase', () => {
  it('routes active draw-telephone drawers to the drawing page', () => {
    expect(getRouteForPhase('dt', { phase: 'drawing', currentTurn: { promptId: 'x' } })).toBe('/draw-tel-draw');
    expect(getRouteForPhase('dt', { phase: 'drawing', currentTurn: null })).toBe('/draw-tel-wait');
  });
});

describe('buildJoinRestorePlan', () => {
  it('keeps brand-new mid-round joins in the lobby', () => {
    const room = { ...baseRoom, phase: 'fitb' };
    const plan = buildJoinRestorePlan({ room, playerId: 'p2', isRejoin: false, miniGameState: null });

    expect(plan.route).toBe('/lobby');
    expect(plan.roomPayload.joinedMidRound).toBe(true);
    expect(plan.actions).toEqual([]);
  });

  it('restores drawing voting state and vote ownership', () => {
    const room = { ...baseRoom, phase: 'drawing' };
    const miniGameState = {
      type: 'draw',
      phase: 'voting',
      round: 2,
      totalRounds: 4,
      mode: 'classic',
      timeLimit: 90,
      word: 'rocket',
      wordResult: 'rocket',
      players: players.map(({ id, name, color }) => ({ id, name, color })),
      submissions: [{ playerId: 'p1', name: 'Alice', color: '#f00', strokes: [], word: 'rocket' }],
      voteCount: 1,
      totalVoters: 3,
      hasVoted: true,
      myVote: 'p1',
    };

    const plan = buildJoinRestorePlan({ room, playerId: 'p2', isRejoin: true, miniGameState });

    expect(plan.route).toBe('/draw');
    expect(plan.actions.map((action) => action.type)).toEqual([
      'DRAW_SET_ROUND',
      'DRAW_VOTING_STARTED',
      'DRAW_VOTE_RECEIVED',
      'DRAW_MARK_VOTED',
    ]);
  });

  it('restores caption end state onto the results page', () => {
    const room = { ...baseRoom, phase: 'caption' };
    const miniGameState = {
      type: 'caption',
      phase: 'ended',
      round: 3,
      totalRounds: 3,
      prompt: 'Caption this',
      featuredOwnerId: 'p1',
      featuredOwnerName: 'Alice',
      featuredPhotoData: 'photo-a',
      writers: [{ id: 'p2', name: 'Bob' }],
      captionSubmittedCount: 2,
      hasWrittenCaption: true,
      captions: [{ id: 'cap-1', text: 'Amazing' }],
      myOwnCaptionId: 'cap-1',
      voteCount: 2,
      totalVoters: 3,
      hasVoted: true,
      myVote: 'cap-2',
      captionResults: [{ id: 'cap-1', playerId: 'p2', text: 'Amazing', voteCount: 2, playerName: 'Bob' }],
      roundScores: { p2: 2 },
      scores: { p2: 4 },
      leaderboard: [{ id: 'p2', pts: 4, name: 'Bob' }],
    };

    const plan = buildJoinRestorePlan({ room, playerId: 'p2', isRejoin: true, miniGameState });

    expect(plan.route).toBe('/caption-results');
    expect(plan.actions.at(-1)).toEqual({ type: 'CAPTION_GAME_OVER', payload: { scores: { p2: 4 }, leaderboard: [{ id: 'p2', pts: 4, name: 'Bob' }] } });
  });

  it('restores photo-vote voting state and selected vote', () => {
    const room = { ...baseRoom, phase: 'photovote' };
    const miniGameState = {
      type: 'photovote',
      phase: 'voting',
      subType: 'pmatch',
      round: 1,
      totalRounds: 5,
      prompt: 'Best superhero landing',
      photos: [{ playerId: 'p1', playerName: 'Alice', photoData: 'photo-a' }],
      voteCount: 1,
      totalVoters: 3,
      hasVoted: true,
      myVote: 'p1',
    };

    const plan = buildJoinRestorePlan({ room, playerId: 'p2', isRejoin: true, miniGameState });

    expect(plan.route).toBe('/photo-vote');
    expect(plan.actions.map((action) => action.type)).toEqual([
      'PHOTOVOTE_VOTING_PHASE',
      'PHOTOVOTE_VOTE_RECEIVED',
      'PHOTOVOTE_MARK_VOTED',
    ]);
  });

  it('restores draw-telephone prompt state and submission status', () => {
    const room = { ...baseRoom, phase: 'dt' };
    const miniGameState = {
      type: 'dt',
      phase: 'prompting',
      totalPrompts: 3,
      promptSecondsLeft: 25,
      promptsSubmittedCount: 2,
      hasSubmittedPrompt: true,
    };

    const plan = buildJoinRestorePlan({ room, playerId: 'p2', isRejoin: true, miniGameState });

    expect(plan.route).toBe('/draw-tel-prompt');
    expect(plan.actions.map((action) => action.type)).toEqual([
      'DT_PROMPT_PHASE',
      'DT_PROMPT_RECEIVED',
      'DT_MARK_PROMPT_SUBMITTED',
    ]);
  });
});

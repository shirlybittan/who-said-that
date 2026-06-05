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

  it('routes mlt and mltEnd to the correct pages', () => {
    expect(getRouteForPhase('mlt', null)).toBe('/mlt-vote');
    expect(getRouteForPhase('mltEnd', null)).toBe('/mlt-end');
  });

  it('routes totEnd to the results page', () => {
    expect(getRouteForPhase('totEnd', null)).toBe('/tot-end');
  });

  it('returns lobby for unknown phases', () => {
    expect(getRouteForPhase('unknown', null)).toBe('/lobby');
    expect(getRouteForPhase(null, null)).toBe('/lobby');
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

  it('restores MLT voting state including own vote and timer', () => {
    const room = {
      ...baseRoom,
      phase: 'mlt',
      gameName: 'Fun Night',
      mlt: {
        roundState: 'voting',
        currentPrompt: 'Most likely to forget their keys',
        round: 2,
        totalRounds: 5,
        votes: { p1: 'p3', p3: 'p1' },
        scores: { p1: 1, p2: 0, p3: 0 },
        totalVotes: {},
        wins: {},
        jokers: { p1: 2, p2: 1, p3: 2 },
        jokersThisRound: {},
        secondsLeft: 18,
        paused: false,
      },
    };

    const plan = buildJoinRestorePlan({ room, playerId: 'p2', isRejoin: true, miniGameState: null });

    expect(plan.route).toBe('/mlt-vote');
    const types = plan.actions.map((a) => a.type);
    expect(types).toContain('MLT_SET_PROMPT');
    expect(types).toContain('MLT_VOTE_RECEIVED');
    expect(types).toContain('MLT_SET_TIMER');
    // p2 has not voted
    expect(types).not.toContain('MLT_MARK_VOTED');
    // Not paused
    expect(types).not.toContain('MLT_SET_PAUSED');

    const promptAction = plan.actions.find((a) => a.type === 'MLT_SET_PROMPT');
    expect(promptAction.payload.prompt).toBe('Most likely to forget their keys');
    expect(promptAction.payload.round).toBe(2);
    expect(promptAction.payload.jokersLeft).toBe(1);

    const voteAction = plan.actions.find((a) => a.type === 'MLT_VOTE_RECEIVED');
    expect(voteAction.payload.voteCount).toBe(2);
  });

  it('restores MLT voting state and marks own vote when present', () => {
    const room = {
      ...baseRoom,
      phase: 'mlt',
      mlt: {
        roundState: 'voting',
        currentPrompt: 'Most likely to win a cooking show',
        round: 1,
        totalRounds: 5,
        votes: { p2: 'p3' },
        scores: {},
        totalVotes: {},
        wins: {},
        jokers: { p1: 2, p2: 2, p3: 2 },
        jokersThisRound: {},
        secondsLeft: 25,
        paused: false,
      },
    };

    const plan = buildJoinRestorePlan({ room, playerId: 'p2', isRejoin: true, miniGameState: null });

    const types = plan.actions.map((a) => a.type);
    expect(types).toContain('MLT_MARK_VOTED');
    const markVotedAction = plan.actions.find((a) => a.type === 'MLT_MARK_VOTED');
    expect(markVotedAction.payload.votedPlayerId).toBe('p3');
  });

  it('restores MLT results state with recomputed vote tallies', () => {
    const room = {
      ...baseRoom,
      phase: 'mlt',
      mlt: {
        roundState: 'results',
        currentPrompt: 'Most likely to be famous',
        round: 3,
        totalRounds: 5,
        votes: { p1: 'p2', p2: 'p2', p3: 'p1' },
        scores: { p1: 1, p2: 2, p3: 1 },
        totalVotes: { p2: 2, p1: 1 },
        wins: { p2: 1 },
        jokers: { p1: 2, p2: 2, p3: 2 },
        jokersThisRound: {},
        secondsLeft: 0,
        paused: false,
      },
    };

    const plan = buildJoinRestorePlan({ room, playerId: 'p1', isRejoin: true, miniGameState: null });

    expect(plan.route).toBe('/mlt-vote');
    const types = plan.actions.map((a) => a.type);
    expect(types).toContain('MLT_SET_RESULTS');

    const resultsAction = plan.actions.find((a) => a.type === 'MLT_SET_RESULTS');
    // p2 got 2 votes → majority
    expect(resultsAction.payload.majorityPlayerIds).toContain('p2');
    expect(resultsAction.payload.scores).toEqual({ p1: 1, p2: 2, p3: 1 });
    const p2result = resultsAction.payload.results.find((r) => r.playerId === 'p2');
    expect(p2result.count).toBe(2);
  });

  it('restores mltEnd leaderboard for reconnecting players', () => {
    const room = {
      ...baseRoom,
      phase: 'mltEnd',
      mlt: {
        roundState: 'end',
        scores: { p1: 3, p2: 5, p3: 1 },
        totalVotes: { p1: 4, p2: 6, p3: 2 },
        wins: { p1: 1, p2: 2, p3: 0 },
        jokers: {},
        jokersThisRound: {},
      },
    };

    const plan = buildJoinRestorePlan({ room, playerId: 'p1', isRejoin: true, miniGameState: null });

    expect(plan.route).toBe('/mlt-end');
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].type).toBe('MLT_SET_END');

    const { leaderboard } = plan.actions[0].payload;
    expect(leaderboard[0].playerId).toBe('p2');
    expect(leaderboard[0].score).toBe(5);
    expect(leaderboard[0].wins).toBe(2);
  });

  it('restores totEnd leaderboard for reconnecting players', () => {
    const room = {
      ...baseRoom,
      phase: 'totEnd',
      tot: {
        scores: { p1: 4, p2: 2, p3: 3 },
      },
    };

    const plan = buildJoinRestorePlan({ room, playerId: 'p2', isRejoin: true, miniGameState: null });

    expect(plan.route).toBe('/tot-end');
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].type).toBe('TOT_SET_END');

    const { leaderboard } = plan.actions[0].payload;
    expect(leaderboard[0].playerId).toBe('p1');
    expect(leaderboard[0].score).toBe(4);
    expect(leaderboard[1].score).toBe(3);
  });

  it('restores classic WST question phase with answered state', () => {
    const room = {
      ...baseRoom,
      phase: 'question',
      currentQuestion: 'What is your biggest fear?',
      currentRound: 2,
      totalRounds: 3,
      questions: [{ id: 'q1', text: 'What is your biggest fear?', type: 'wst' }],
      currentQuestionIndex: 0,
      answers: [
        { playerId: 'p1', text: 'Spiders', playerName: 'Alice' },
        { playerId: 'p3', text: 'Heights', playerName: 'Cara' },
      ],
    };

    const plan = buildJoinRestorePlan({ room, playerId: 'p1', isRejoin: true, miniGameState: null });

    expect(plan.route).toBe('/question');
    const types = plan.actions.map((a) => a.type);
    expect(types).toContain('SET_QUESTION');
    expect(types).toContain('MARK_ANSWERED');

    const markedAction = plan.actions.find((a) => a.type === 'MARK_ANSWERED');
    expect(markedAction.payload.myAnswer).toBe('Spiders');
  });

  it('restores classic WST voting phase', () => {
    const room = {
      ...baseRoom,
      phase: 'voting',
      answers: [
        { playerId: 'p1', text: 'Spiders' },
        { playerId: 'p2', text: 'Public speaking' },
      ],
      currentAnswerIndex: 1,
    };

    const plan = buildJoinRestorePlan({ room, playerId: 'p3', isRejoin: true, miniGameState: null });

    expect(plan.route).toBe('/vote');
    expect(plan.actions[0].type).toBe('SET_ANSWERS');
    expect(plan.actions[0].payload.answers).toHaveLength(2);
    expect(plan.actions[0].payload.currentIndex).toBe(1);
  });
});

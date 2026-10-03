const { createVotingGame } = require('../VotingGameTemplate');

// ── Minimal mock helpers ───────────────────────────────────────────────────

function makeIo() {
  const emitted = [];
  const emitFn = jest.fn((event, data) => emitted.push({ event, data }));
  return {
    to: jest.fn(() => ({ emit: emitFn })),
    _emitted: emitted,
    _lastEmit() { return emitted[emitted.length - 1]; },
    _emitsOf(event) { return emitted.filter(e => e.event === event); },
  };
}

function makeRoom(playerCount = 2) {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id:          `p${i + 1}`,
    name:        `Player ${i + 1}`,
    color:       '#ffffff',
    isConnected: true,
    isPlaying:   true,
  }));
  return { players, _timers: {} };
}

const PROMPTS = ['Who is most likely to fall asleep first?', 'Who would survive a zombie apocalypse?'];

function makeGame(overrides = {}) {
  return createVotingGame({
    gameKey:        'test',
    votingSeconds:  15,
    getPrompt:      (_room, round) => PROMPTS[(round - 1) % PROMPTS.length],
    scoreConfig:    { pointsPerVote: 100 },
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('createVotingGame — validation', () => {
  it('throws when gameKey is missing', () => {
    expect(() => createVotingGame({ votingSeconds: 10, getPrompt: () => 'q' })).toThrow('gameKey');
  });

  it('throws when votingSeconds is missing', () => {
    expect(() => createVotingGame({ gameKey: 'x', getPrompt: () => 'q' })).toThrow('votingSeconds');
  });

  it('throws when getPrompt is missing', () => {
    expect(() => createVotingGame({ gameKey: 'x', votingSeconds: 10 })).toThrow('getPrompt');
  });
});

describe('createVotingGame — start()', () => {
  it('initialises room[gameKey] with round 1 data', () => {
    const game = makeGame();
    const room = makeRoom();
    game.start({}, room, 'ABC', { rounds: 3 });

    expect(room.test).toBeDefined();
    expect(room.test.round).toBe(1);
    expect(room.test.totalRounds).toBe(3);
    expect(room.test.phase).toBe('voting');
    expect(room.test.prompt).toBe(PROMPTS[0]);
  });

  it('clamps rounds to 1 for invalid input', () => {
    const game = makeGame();
    const room = makeRoom();
    game.start({}, room, 'ABC', { rounds: 0 });
    expect(room.test.totalRounds).toBe(1);
  });

  it('creates a VoteCollector on room[gameKey]', () => {
    const game = makeGame();
    const room = makeRoom();
    game.start({}, room, 'ABC');
    expect(room.test._voteCollector).toBeDefined();
    expect(typeof room.test._voteCollector.castVote).toBe('function');
  });

  it('fires onRoundStart callback with correct round number', () => {
    const onRoundStart = jest.fn();
    const game = makeGame({ onRoundStart });
    const room = makeRoom();
    game.start({}, room, 'CODE');
    expect(onRoundStart).toHaveBeenCalledWith({}, room, 'CODE', 1);
  });
});

describe('createVotingGame — startVoting()', () => {
  it('sets phase to voting', () => {
    const game = makeGame();
    const io   = makeIo();
    const room = makeRoom();
    game.start(io, room, 'ABC');
    game.startVoting(io, room, 'ABC');
    expect(room.test.phase).toBe('voting');
  });

  it('emits test:voting_started with player list', () => {
    const game = makeGame();
    const io   = makeIo();
    const room = makeRoom(3);
    game.start(io, room, 'ABC');
    io._emitted.length = 0; // clear start emissions

    game.startVoting(io, room, 'ABC');

    const ev = io._emitsOf('test:voting_started');
    expect(ev.length).toBe(1);
    expect(ev[0].data.players).toHaveLength(3);
    expect(ev[0].data.secondsLeft).toBe(15);
  });

  it('stores a timer on room._timers[gameKey]', () => {
    const game = makeGame();
    const io   = makeIo();
    const room = makeRoom();
    game.start(io, room, 'ABC');
    game.startVoting(io, room, 'ABC');
    expect(room._timers.test).toBeDefined();
  });
});

describe('createVotingGame — showResults()', () => {
  it('calculates scores and emits test:results', () => {
    const game = makeGame();
    const io   = makeIo();
    const room = makeRoom(3);
    game.start(io, room, 'ABC', { rounds: 1 });

    // p1 and p3 both vote for p2 (no self-vote)
    room.test.votes = { p1: 'p2', p3: 'p2' };

    game.showResults(io, room, 'ABC');

    const ev = io._emitsOf('test:results');
    expect(ev.length).toBe(1);
    expect(ev[0].data.roundScores.p2).toBe(200); // 2 votes × 100
    expect(ev[0].data.winners).toContain('p2');
  });

  it('is idempotent — does not emit twice when called twice', () => {
    const game = makeGame();
    const io   = makeIo();
    const room = makeRoom();
    game.start(io, room, 'ABC', { rounds: 2 });

    room.test.votes = { p1: 'p2' };
    game.showResults(io, room, 'ABC');
    game.showResults(io, room, 'ABC'); // second call — should be a no-op

    expect(io._emitsOf('test:results')).toHaveLength(1);
  });

  it('accumulates scores across rounds', () => {
    const game = makeGame();
    const io   = makeIo();
    const room = makeRoom(3);
    game.start(io, room, 'ABC', { rounds: 2 });

    // Round 1 — p1 and p3 both vote for p2
    room.test.votes = { p1: 'p2', p3: 'p2' };
    game.showResults(io, room, 'ABC');
    expect(room.test.scores.p2).toBe(200);

    // Advance to round 2
    game.nextRound(io, room, 'ABC');
    room.test.votes = { p1: 'p2', p3: 'p2' };
    game.showResults(io, room, 'ABC');
    expect(room.test.scores.p2).toBe(400); // 200 + 200
  });

  it('calls onResults override instead of default emit', () => {
    const onResults = jest.fn();
    const game = makeGame({ onResults });
    const io   = makeIo();
    const room = makeRoom();
    game.start(io, room, 'ABC', { rounds: 1 });
    room.test.votes = {};
    game.showResults(io, room, 'ABC');

    expect(onResults).toHaveBeenCalledTimes(1);
    expect(io._emitsOf('test:results')).toHaveLength(0);
  });
});

describe('createVotingGame — nextRound()', () => {
  it('increments round number', () => {
    const game = makeGame();
    const io   = makeIo();
    const room = makeRoom();
    game.start(io, room, 'ABC', { rounds: 3 });

    room.test.votes = {};
    game.showResults(io, room, 'ABC');
    game.nextRound(io, room, 'ABC');

    expect(room.test.round).toBe(2);
  });

  it('emits test:end after last round', () => {
    const game = makeGame();
    const io   = makeIo();
    const room = makeRoom();
    game.start(io, room, 'ABC', { rounds: 1 });

    room.test.votes = {};
    game.showResults(io, room, 'ABC');
    game.nextRound(io, room, 'ABC'); // triggers game end

    expect(io._emitsOf('test:end')).toHaveLength(1);
  });

  it('returns false when game has ended', () => {
    const game = makeGame();
    const io   = makeIo();
    const room = makeRoom();
    game.start(io, room, 'ABC', { rounds: 1 });

    room.test.votes = {};
    game.showResults(io, room, 'ABC');
    const result = game.nextRound(io, room, 'ABC');

    expect(result).toBe(false);
  });
});

describe('createVotingGame — VoteCollector integration', () => {
  it('auto-triggers showResults when all players vote', () => {
    const game = makeGame();
    const io   = makeIo();
    const room = makeRoom(2);
    game.start(io, room, 'ABC', { rounds: 1 });

    // Cast votes through the collector
    room.test._voteCollector.castVote('p1', 'p2');
    room.test._voteCollector.castVote('p2', 'p1');

    expect(io._emitsOf('test:results')).toHaveLength(1);
  });

  it('rejects duplicate votes', () => {
    const game = makeGame();
    const io   = makeIo();
    const room = makeRoom(3);
    game.start(io, room, 'ABC', { rounds: 1 });

    room.test._voteCollector.castVote('p1', 'p2');
    const dupe = room.test._voteCollector.castVote('p1', 'p3');

    expect(dupe).toBe(false);
    expect(Object.keys(room.test.votes).length).toBe(1);
  });
});

describe('rehydrate after a server restart (P0-02)', () => {
  const { serializeRoom } = require('../../persistence');

  test('nextRound works on a room restored without its managers', () => {
    const game = makeGame();
    const io = makeIo();
    const live = makeRoom(2);
    live.code = 'RH';
    game.start(io, live, 'RH', { rounds: 3 });
    game.showResults(io, live, 'RH');
    // Simulate persist → restart → restore
    const restored = JSON.parse(JSON.stringify(serializeRoom(live)));
    restored.players.forEach(p => { p.isConnected = true; });
    restored._timers = {};
    expect(restored.test._roundManager).toBeUndefined();

    expect(game.nextRound(io, restored, 'RH')).toBe(true);
    expect(restored.test.round).toBe(2);
    expect(restored.test._voteCollector).toBeDefined();
    game.rehydrate(io, restored, 'RH'); // idempotent
    expect(restored.test.round).toBe(2);
  });

  test('rehydrate replays persisted votes so the round can still complete', () => {
    const game = makeGame();
    const io = makeIo();
    const live = makeRoom(2);
    game.start(io, live, 'RV', { rounds: 2 });
    live.test._voteCollector.castVote('p1', 'p2');
    const restored = JSON.parse(JSON.stringify(serializeRoom(live)));
    restored.players.forEach(p => { p.isConnected = true; });
    restored._timers = {};
    game.rehydrate(io, restored, 'RV');
    expect(restored.test._voteCollector.hasVoted('p1')).toBe(true);
    restored.test._voteCollector.castVote('p2', 'p1');
    expect(restored.test.phase).toBe('results');
  });
});

describe('createVotingGame — per-room self-vote option (P2-42)', () => {
  const selfVoteGame = () => makeGame({ scoreConfig: { allowSelfVote: (room) => room.test?.allowSelfVote !== false } });

  it('accepts a self-vote while the room option is on', () => {
    const game = selfVoteGame();
    const room = makeRoom(3);
    game.start(makeIo(), room, 'ABC', { rounds: 2, _initialState: { allowSelfVote: true } });
    expect(room.test._voteCollector.castVote('p1', 'p1')).toBe(true);
  });

  it('rejects a self-vote once the host turns the option off', () => {
    const game = selfVoteGame();
    const room = makeRoom(3);
    game.start(makeIo(), room, 'ABC', { rounds: 2, _initialState: { allowSelfVote: false } });
    expect(room.test._voteCollector.castVote('p1', 'p1')).toBe(false);
    expect(room.test._voteCollector.castVote('p1', 'p2')).toBe(true);
  });
});

describe('createVotingGame — resumeVotingTimer after a restart (P2-38)', () => {
  it('restarts the countdown from the saved seconds without touching votes', () => {
    const game = makeGame({ scoreConfig: { allowSelfVote: true } });
    const io = makeIo();
    const room = makeRoom(3);
    game.start(io, room, 'ABC', { rounds: 2 });
    game.startVoting(io, room, 'ABC');
    room.test._voteCollector.castVote('p1', 'p2');
    room.test.secondsLeft = 12;
    room._timers.test.cancel();
    delete room._timers.test;                       // what a restart loses
    const startedBefore = io._emitsOf('test:voting_started').length;

    game.resumeVotingTimer(io, room, 'ABC');

    expect(room._timers.test).toBeTruthy();
    expect(room.test.secondsLeft).toBe(12);
    expect(room.test.votes).toEqual({ p1: 'p2' });
    expect(io._emitsOf('test:voting_started')).toHaveLength(startedBefore);
    room._timers.test.cancel();
  });

  it('does nothing outside voting', () => {
    const game = makeGame();
    const room = makeRoom(3);
    game.start(makeIo(), room, 'ABC', { rounds: 2 });
    room.test.phase = 'results';
    game.resumeVotingTimer(makeIo(), room, 'ABC');
    expect(room._timers.test).toBeFalsy();
  });
});

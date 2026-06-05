const { buildMiniGameSnapshot } = require('./miniGameSnapshot');

const players = [
  { id: 'p1', name: 'Alice', color: '#f00', isConnected: true, isPlaying: true },
  { id: 'p2', name: 'Bob', color: '#0f0', isConnected: true, isPlaying: true },
  { id: 'p3', name: 'Cara', color: '#00f', isConnected: true, isPlaying: true },
];

describe('buildMiniGameSnapshot', () => {
  it('builds drawing voting snapshots with player-specific vote state', () => {
    const room = {
      phase: 'drawing',
      players,
      currentRound: 2,
      totalRounds: 4,
      draw: {
        phase: 'voting',
        round: 2,
        totalRounds: 4,
        mode: 'classic',
        word: 'rocket',
        timeLimit: 90,
        secondsLeft: 42,
        submissions: {
          p1: { strokes: [{ points: [{ x: 1, y: 1 }] }] },
          p2: { strokes: [{ points: [{ x: 2, y: 2 }] }] },
        },
        votes: { p3: 'p2' },
        scores: { p1: 1, p2: 3, p3: 0 },
      },
    };

    const snapshot = buildMiniGameSnapshot(room, 'p3');

    expect(snapshot.type).toBe('draw');
    expect(snapshot.phase).toBe('voting');
    expect(snapshot.submissions).toHaveLength(2);
    expect(snapshot.voteCount).toBe(1);
    expect(snapshot.hasVoted).toBe(true);
    expect(snapshot.myVote).toBe('p2');
    expect(snapshot.leaderboard[0]).toMatchObject({ id: 'p2', score: 3 });
  });

  it('builds fitb snapshots with anonymous answers and my answer state', () => {
    const room = {
      phase: 'fitb',
      players,
      fitb: {
        phase: 'voting',
        round: 1,
        totalRounds: 3,
        question: 'Best snack?',
        answers: [
          { playerId: 'p1', text: 'chips', votes: 1 },
          { playerId: 'p2', text: 'cake', votes: 0 },
        ],
        _votes: { p3: 1 },
        scores: { p1: 1, p2: 0, p3: 0 },
      },
    };

    const snapshot = buildMiniGameSnapshot(room, 'p1');

    expect(snapshot.type).toBe('fitb');
    expect(snapshot.answers).toEqual([{ id: 0, text: 'chips' }, { id: 1, text: 'cake' }]);
    expect(snapshot.hasAnswered).toBe(true);
    expect(snapshot.myAnswer).toBe('chips');
    expect(snapshot.voteCount).toBe(1);
  });

  it('builds selfie drawing snapshots with assigned photo context', () => {
    const room = {
      phase: 'selfie',
      players,
      selfie: {
        phase: 'drawing',
        round: 1,
        totalRounds: 2,
        photos: { p1: 'photo-a', p2: 'photo-b', p3: 'photo-c' },
        assignments: { p1: 'p2', p2: 'p3', p3: 'p1' },
        strokes: { p2: [{ color: '#000', points: [] }] },
        votes: {},
        scores: { p1: 0, p2: 1, p3: 0 },
        promptTemplate: 'Turn [Name] into a pirate',
      },
    };

    const snapshot = buildMiniGameSnapshot(room, 'p1');

    expect(snapshot.type).toBe('selfie');
    expect(snapshot.phase).toBe('drawing');
    expect(snapshot.assignedOwnerPlayerId).toBe('p2');
    expect(snapshot.assignedOwnerName).toBe('Bob');
    expect(snapshot.assignedPhotoData).toBe('photo-b');
    expect(snapshot.assignedPrompt).toContain('Bob');
    expect(snapshot.drawingCount).toBe(1);
  });

  it('builds caption voting snapshots with own caption id and vote state', () => {
    const room = {
      phase: 'caption',
      players,
      caption: {
        phase: 'voting',
        currentRound: 2,
        totalRounds: 3,
        currentPrompt: 'Caption this awkward photo',
        featuredOwnerId: 'p1',
        photos: { p1: 'photo-a' },
        captions: {
          p2: { id: 'cap-2', playerId: 'p2', text: 'When Monday hits' },
          p3: { id: 'cap-3', playerId: 'p3', text: 'Totally fine' },
        },
        votes: { p3: 'cap-2' },
        scores: { p2: 1, p3: 0 },
      },
    };

    const snapshot = buildMiniGameSnapshot(room, 'p2');

    expect(snapshot.type).toBe('caption');
    expect(snapshot.phase).toBe('voting');
    expect(snapshot.featuredOwnerId).toBe('p1');
    expect(snapshot.featuredPhotoData).toBe('photo-a');
    expect(snapshot.captions).toHaveLength(2);
    expect(snapshot.myOwnCaptionId).toBe('cap-2');
    expect(snapshot.hasWrittenCaption).toBe(true);
    expect(snapshot.voteCount).toBe(1);
    expect(snapshot.hasVoted).toBe(false);
    expect(snapshot.captionResults[0].id).toBe('cap-2');
    expect(snapshot.captionResults[0].voteCount).toBe(1);
  });

  it('builds photovote voting snapshots with per-player vote state', () => {
    const room = {
      phase: 'photovote',
      players,
      photoVote: {
        phase: 'voting',
        subType: 'pmatch',
        currentRound: 1,
        totalRounds: 5,
        currentPrompt: 'Best superhero landing',
        photos: { p1: 'photo-a', p2: 'photo-b', p3: 'photo-c' },
        votes: { p2: 'p1', p3: 'p1' },
        scores: { p1: 2, p2: 0, p3: 0 },
      },
    };

    const snapshot = buildMiniGameSnapshot(room, 'p3');

    expect(snapshot.type).toBe('photovote');
    expect(snapshot.phase).toBe('voting');
    expect(snapshot.subType).toBe('pmatch');
    expect(snapshot.prompt).toBe('Best superhero landing');
    expect(snapshot.photos).toHaveLength(3);
    expect(snapshot.voteCount).toBe(2);
    expect(snapshot.hasVoted).toBe(true);
    expect(snapshot.myVote).toBe('p1');
    expect(snapshot.voteResults[0].playerId).toBe('p1');
    expect(snapshot.voteResults[0].voteCount).toBe(2);
    expect(snapshot.voteResults[0].isWinner).toBe(true);
  });

  it('builds draw-telephone reveal snapshots with the current chain state', () => {
    const now = Date.now();
    const room = {
      phase: 'dt',
      players,
      dt: {
        phase: 'reveal',
        chains: {
          chain1: {
            id: 'chain1',
            authorId: 'p1',
            templateText: '[name] on the moon',
            targetPlayerId: 'p2',
            finalText: 'Bob on the moon',
            originalSelfieData: 'selfie-b',
            drawingSteps: [
              { playerId: 'p3', strokes: [{ points: [{ x: 1, y: 1 }] }] },
            ],
          },
        },
        guesses: { chain1: 'Bob in space' },
        votes: { chain1: { p1: 'close' } },
        revealQueue: ['chain1'],
        revealCurrentIndex: 0,
        revealStep: 2,
        voteStartedAt: now - 5000,
        scores: { p1: 1, p2: 0, p3: 2 },
      },
    };

    const snapshot = buildMiniGameSnapshot(room, 'p1', { dtVoteSeconds: 30 });

    expect(snapshot.type).toBe('dt');
    expect(snapshot.phase).toBe('reveal');
    expect(snapshot.reveal.promptId).toBe('chain1');
    expect(snapshot.reveal.targetName).toBe('Bob');
    expect(snapshot.reveal.guessText).toBe('Bob in space');
    expect(snapshot.reveal.voteSecondsLeft).toBeLessThanOrEqual(25);
  });
});

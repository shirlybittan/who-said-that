const { tallyVotes, calculateVotingScores, buildLeaderboard, mergeRoundScores } = require('../ScoreCalculator');

const players = (...ids) => ids.map((id) => ({ id, name: id.toUpperCase(), color: '#fff' }));

describe('tallyVotes', () => {
  test('counts every target by default (unseeded)', () => {
    const { voteCounts, maxVotes, winners } = tallyVotes({ a: 'x', b: 'x', c: 'y' });
    expect(voteCounts).toEqual({ x: 2, y: 1 });
    expect(maxVotes).toBe(2);
    expect(winners).toEqual(['x']);
  });

  test('seeded + countUnseeded:false ignores votes for unknown targets and shows all seeds', () => {
    const { voteCounts } = tallyVotes(
      { a: 'p1', b: 'p1', c: 'ghost' },
      { players: players('p1', 'p2'), countUnseeded: false },
    );
    expect(voteCounts).toEqual({ p1: 2, p2: 0 }); // ghost ignored, p2 present at 0
  });

  test('seeded + countUnseeded:true also counts unknown targets', () => {
    const { voteCounts } = tallyVotes(
      { a: 'p1', c: 'ghost' },
      { players: players('p1', 'p2'), countUnseeded: true },
    );
    expect(voteCounts).toEqual({ p1: 1, p2: 0, ghost: 1 });
  });

  test('excludeSelf drops self-votes', () => {
    const { voteCounts } = tallyVotes({ a: 'a', b: 'a' }, { excludeSelf: true });
    expect(voteCounts).toEqual({ a: 1 }); // a's self-vote dropped, b's counted
  });

  test('ties yield multiple winners; no votes yields none', () => {
    expect(tallyVotes({ a: 'x', b: 'y' }).winners.sort()).toEqual(['x', 'y']);
    const empty = tallyVotes({});
    expect(empty.maxVotes).toBe(0);
    expect(empty.winners).toEqual([]);
  });
});

describe('calculateVotingScores (behaviour pinned across the tallyVotes refactor)', () => {
  test('per-vote scoring, self-vote excluded by default', () => {
    const res = calculateVotingScores({
      votes: { p2: 'p1', p3: 'p1', p1: 'p1' }, // p1 self-vote must not count
      players: players('p1', 'p2', 'p3'),
    });
    expect(res.voteCounts).toEqual({ p1: 2, p2: 0, p3: 0 });
    expect(res.scores).toEqual({ p1: 200, p2: 0, p3: 0 });
    expect(res.winners).toEqual(['p1']);
    expect(res.maxVotes).toBe(2);
  });

  test('allowSelfVote counts self-votes; custom pointsPerVote', () => {
    const res = calculateVotingScores({
      votes: { p1: 'p1', p2: 'p1' },
      players: players('p1', 'p2'),
      config: { allowSelfVote: true, pointsPerVote: 10 },
    });
    expect(res.voteCounts.p1).toBe(2);
    expect(res.scores.p1).toBe(20);
  });

  test('empty votes → zeros, no winners', () => {
    const res = calculateVotingScores({ votes: {}, players: players('p1', 'p2') });
    expect(res.scores).toEqual({ p1: 0, p2: 0 });
    expect(res.maxVotes).toBe(0);
    expect(res.winners).toEqual([]);
  });
});

describe('buildLeaderboard / mergeRoundScores (unchanged)', () => {
  test('leaderboard sorts descending by score', () => {
    const lb = buildLeaderboard({ p1: 5, p2: 9 }, players('p1', 'p2'));
    expect(lb.map((x) => x.id)).toEqual(['p2', 'p1']);
  });
  test('mergeRoundScores accumulates in place', () => {
    const total = { p1: 3 };
    mergeRoundScores(total, { p1: 2, p2: 4 });
    expect(total).toEqual({ p1: 5, p2: 4 });
  });
});

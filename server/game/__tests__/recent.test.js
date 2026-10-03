const { recentDistinct } = require('../recent');
const { fisherYatesShuffle, shuffleInPlace } = require('../shuffle');

describe('recentDistinct', () => {
  it('a question used long ago and again just now counts as recent', () => {
    // A is old, then 4 others, then A again: with n=2 the recent ones are D and A.
    expect(recentDistinct(['A', 'B', 'C', 'D', 'A'], 2)).toEqual(['D', 'A']);
    // The old Set-based version kept A's first position and returned ['C', 'D'].
    expect([...new Set(['A', 'B', 'C', 'D', 'A'])].slice(-2)).toEqual(['C', 'D']);
  });

  it('dedupes and caps at n', () => {
    expect(recentDistinct(['A', 'A', 'B', 'B'], 5)).toEqual(['A', 'B']);
    expect(recentDistinct([], 3)).toEqual([]);
  });
});

describe('shuffle', () => {
  it('keeps every item exactly once', () => {
    const src = [1, 2, 3, 4, 5, 6];
    expect([...fisherYatesShuffle(src)].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6]); // copy, not in place
    const arr = [1, 2, 3];
    expect(shuffleInPlace(arr)).toBe(arr);
  });

  it('is unbiased: every position is roughly uniform', () => {
    const counts = [0, 0, 0];
    for (let k = 0; k < 30000; k++) counts[fisherYatesShuffle(['x', 'y', 'z']).indexOf('x')]++;
    counts.forEach((c) => expect(Math.abs(c - 10000)).toBeLessThan(600));
  });
});

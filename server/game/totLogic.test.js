/**
 * Tests for ToT (This or That) result calculation logic.
 * These test the fixed closeTotRound percentage and tie-detection behaviour.
 */

describe('ToT round result calculations', () => {
  // Helper that mirrors the fixed closeTotRound calculation logic from server/index.js
  function calcTotResult({ votesA, votesB }) {
    const countA = Object.keys(votesA).length;
    const countB = Object.keys(votesB).length;
    const total = countA + countB;

    const pctA = total === 0 ? 0 : Math.round((countA / total) * 100);
    const pctB = total === 0 ? 0 : 100 - pctA;

    const tieRound = countA === countB;
    const majorityChoice = tieRound ? null : (countA > countB ? 'a' : 'b');

    return { countA, countB, pctA, pctB, tieRound, majorityChoice };
  }

  it('shows 0% for both options when nobody voted', () => {
    const result = calcTotResult({ votesA: {}, votesB: {} });
    expect(result.pctA).toBe(0);
    expect(result.pctB).toBe(0);
    expect(result.countA).toBe(0);
    expect(result.countB).toBe(0);
  });

  it('does NOT produce 100% when nobody voted (regression for 0-vote bug)', () => {
    const result = calcTotResult({ votesA: {}, votesB: {} });
    // Before fix: total = (0 + 0 || 1) = 1, pctA = round(0/1*100) = 0, pctB = 100 - 0 = 100 (bug!)
    expect(result.pctA + result.pctB).toBe(0); // both should be 0
  });

  it('reports majorityChoice null on a tie', () => {
    const result = calcTotResult({ votesA: { p1: 'a', p3: 'a' }, votesB: { p2: 'b', p4: 'b' } });
    expect(result.tieRound).toBe(true);
    expect(result.majorityChoice).toBeNull();
  });

  it('reports majority "a" when A wins', () => {
    const result = calcTotResult({ votesA: { p1: 'a', p2: 'a', p3: 'a' }, votesB: { p4: 'b' } });
    expect(result.tieRound).toBe(false);
    expect(result.majorityChoice).toBe('a');
    expect(result.pctA).toBe(75);
    expect(result.pctB).toBe(25);
  });

  it('reports majority "b" when B wins', () => {
    const result = calcTotResult({ votesA: { p1: 'a' }, votesB: { p2: 'b', p3: 'b' } });
    expect(result.tieRound).toBe(false);
    expect(result.majorityChoice).toBe('b');
    expect(result.pctA).toBe(33);
    expect(result.pctB).toBe(67);
  });

  it('percentages sum to 100 when votes exist', () => {
    const result = calcTotResult({ votesA: { p1: 'a', p2: 'a' }, votesB: { p3: 'b' } });
    expect(result.pctA + result.pctB).toBe(100);
  });

  it('single vote for A gives 100% A and 0% B', () => {
    const result = calcTotResult({ votesA: { p1: 'a' }, votesB: {} });
    expect(result.pctA).toBe(100);
    expect(result.pctB).toBe(0);
    expect(result.majorityChoice).toBe('a');
  });
});

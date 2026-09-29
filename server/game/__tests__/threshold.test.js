const SubmissionTracker = require('../SubmissionTracker');
const VoteCollector = require('../VoteCollector');

describe('expected-ids completion (P2-01 / P2-02)', () => {
  test('a submitter who left cannot complete the phase for someone still typing', () => {
    let expected = ['p1', 'p2', 'p3', 'p4'];
    const onComplete = jest.fn();
    const t = SubmissionTracker.create({ getExpectedIds: () => expected, onComplete });
    t.record('p1', 'x');
    expected = ['p2', 'p3', 'p4']; // p1 disconnects
    t.record('p2', 'x');
    t.record('p3', 'x');
    expect(onComplete).not.toHaveBeenCalled(); // p4 still pending
    t.record('p4', 'x');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('recheck completes the phase when the last pending player leaves', () => {
    let expected = ['a', 'b', 'c'];
    const onComplete = jest.fn();
    const v = VoteCollector.create({ getExpectedIds: () => expected, onComplete });
    v.castVote('a', 'b');
    v.castVote('b', 'a');
    expect(onComplete).not.toHaveBeenCalled();
    expected = ['a', 'b']; // c disconnects
    v.recheck();
    expect(onComplete).toHaveBeenCalledTimes(1);
    v.recheck();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('an empty expected set never completes', () => {
    const onComplete = jest.fn();
    const t = SubmissionTracker.create({ getExpectedIds: () => [], onComplete });
    t.recheck();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

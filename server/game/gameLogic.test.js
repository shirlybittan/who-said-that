const { calculateScores, selectMixedQuestions, upsertPlayerAnswer } = require('./gameLogic');

describe('calculateScores', () => {
  it('should calculate scores correctly for multiple answers', () => {
    const answers = [
      {
        playerId: 'author1',
        votes: [
          { voterId: 'voter1', votedForId: 'author1' }, // correct
          { voterId: 'voter2', votedForId: 'author2' }, // wrong
        ]
      },
      {
        playerId: 'author2',
        votes: [
          { voterId: 'voter1', votedForId: 'author2' }, // correct
          { voterId: 'author1', votedForId: 'author1' }, // wrong (author1 guessing on author2's answer)
        ]
      }
    ];

    const currentScores = { 'voter1': 0, 'voter2': 0, 'author1': 0, 'author2': 0 };
    const newScores = calculateScores(answers, currentScores, 3);

    // voter1: +1 (first answer) + 1 (second answer) = 2
    // voter2: -1 (first answer) = -1
    // author1: +1 (deception bonus from answer 1) - 1 (voter guessed wrong on answer 2) = 0
    // author2: +1 (deception bonus from answer 2) = 1

    expect(newScores['voter1']).toBe(2);
    expect(newScores['voter2']).toBe(-1);
    expect(newScores['author1']).toBe(0);
    expect(newScores['author2']).toBe(1);
  });
});

describe('selectMixedQuestions', () => {
  const VALID_TYPES = ['wst', 'situational', 'this-or-that', 'drawing'];

  it('returns the requested number of questions', () => {
    const count = 5;
    const questions = selectMixedQuestions(count);
    expect(questions).toHaveLength(count);
  });

  it('returns only valid question types', () => {
    const questions = selectMixedQuestions(10);
    questions.forEach(q => {
      expect(VALID_TYPES).toContain(q.type);
    });
  });

  it('returns an empty array when count is 0', () => {
    expect(selectMixedQuestions(0)).toEqual([]);
  });
});

describe('upsertPlayerAnswer', () => {
  it('allows updating a player answer before voting starts', () => {
    const answers = [
      { playerId: 'p1', playerName: 'A', text: 'old', votes: [] },
      { playerId: 'p2', playerName: 'B', text: 'other', votes: [] },
    ];
    const updated = upsertPlayerAnswer(answers, { playerId: 'p1', playerName: 'A', text: 'new', votes: [] });
    expect(updated).toHaveLength(2);
    expect(updated.find(a => a.playerId === 'p1')?.text).toBe('new');
  });

  it('uses the updated answer text for subsequent scoring input', () => {
    let answers = [{ playerId: 'author1', playerName: 'A', text: 'first draft', votes: [] }];
    answers = upsertPlayerAnswer(answers, {
      playerId: 'author1',
      playerName: 'A',
      text: 'final answer',
      votes: [{ voterId: 'v1', votedForId: 'author1' }],
    });
    expect(answers[0].text).toBe('final answer');
    const scores = calculateScores(answers, { v1: 0, author1: 0 }, 2);
    expect(scores.v1).toBe(1);
  });
});

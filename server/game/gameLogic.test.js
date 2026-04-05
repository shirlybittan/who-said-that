const { calculateScores } = require('./gameLogic');

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

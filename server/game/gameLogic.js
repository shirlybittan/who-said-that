const familyQuestions = require('../questions/family');
const friendsQuestions = require('../questions/friends');

const selectQuestions = (mode, count, customQuestions = []) => {
  let questions = mode === 'family' ? [...familyQuestions] : [...friendsQuestions];
  if (mode === 'custom') {
    questions = customQuestions.length > 0 ? [...customQuestions] : [...friendsQuestions];
  }

  // Fisher-Yates shuffle
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  return questions.slice(0, count);
};

const shuffleAnswers = (answers) => {
  const array = [...answers];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const calculateScores = (answers, currentScores, numPlayers) => {
  const newScores = { ...currentScores };
  
  answers.forEach(answer => {
    let correctGuessesCount = 0;
    const actualAuthorId = answer.playerId;
    if (newScores[actualAuthorId] === undefined) newScores[actualAuthorId] = 0;

    answer.votes.forEach(vote => {
      const voterId = vote.voterId;
      const guessedId = vote.votedForId;
      
      if (newScores[voterId] === undefined) newScores[voterId] = 0;
      
      if (guessedId === actualAuthorId) {
        // Voter guessed correctly
        newScores[voterId] += 1;
        correctGuessesCount++;
      } else {
        // Voter guessed wrongly
        newScores[voterId] -= 1;
        // Deception Bonus
        newScores[actualAuthorId] += 1;
      }
    });

    // Signature Bonus: +1 if majority correctly guess the author
    if (correctGuessesCount > (numPlayers - 1) / 2) {
      newScores[actualAuthorId] += 1;
    }
  });
  
  return newScores;
};

// Compute stats
const computeStats = (players, answers, scores) => {
  return {
    bestDetective: "TBD", // To be implemented later
  };
};

module.exports = {
  selectQuestions,
  shuffleAnswers,
  calculateScores,
  computeStats
};

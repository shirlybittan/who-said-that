const familyQuestions = require('../questions/family');
const friendsQuestions = require('../questions/friends');
const situationalQuestions = require('../questions/situational');
const thisOrThatQuestions = require('../questions/thisOrThat');
const { words: drawingWords } = require('../questions/drawing');

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const selectQuestions = (mode, count, customQuestions = []) => {
  let questions = mode === 'family' ? [...familyQuestions] : [...friendsQuestions];
  if (mode === 'custom') {
    questions = customQuestions.length > 0 ? [...customQuestions] : [...friendsQuestions];
  }
  return shuffle(questions).slice(0, count).map(q => ({ ...q, type: 'wst' }));
};

const selectSituationalQuestions = (count) => {
  return shuffle(situationalQuestions).slice(0, count).map(text => ({ id: `sit-${Math.random()}`, text, type: 'situational' }));
};

const selectThisOrThatQuestions = (count) => {
  return shuffle(thisOrThatQuestions).slice(0, count).map((q, i) => ({ id: `tot-${i}`, text: q.text, a: q.a, b: q.b, type: 'this-or-that' }));
};

const selectDrawingQuestion = () => {
  const word = shuffle([...drawingWords])[0];
  return { id: `draw-${Math.random()}`, word, type: 'drawing' };
};

// Build a mixed question list of the given total length, randomly drawn from all three types
const selectMixedQuestions = (count, mode, customQuestions = [], selectedTypes = null) => {
  const useWst = !selectedTypes || selectedTypes.includes('who-said-that');
  const useSit = !selectedTypes || selectedTypes.includes('situational');
  const useTot = !selectedTypes || selectedTypes.includes('this-or-that');
  const useDraw = selectedTypes && selectedTypes.includes('drawing');

  const wstPool = useWst ? shuffle(mode === 'family' ? familyQuestions : friendsQuestions).slice(0, count).map(q => ({ ...q, type: 'wst' })) : [];
  const sitPool = useSit ? shuffle(situationalQuestions).slice(0, count).map(text => ({ id: `sit-${Math.random()}`, text, type: 'situational' })) : [];
  const totPool = useTot ? shuffle(thisOrThatQuestions).slice(0, count).map((q, i) => ({ id: `tot-${i}`, text: q.text, a: q.a, b: q.b, type: 'this-or-that' })) : [];
  const drawPool = useDraw ? shuffle(drawingWords).slice(0, count).map(word => ({ id: `draw-${Math.random()}`, word, type: 'drawing' })) : [];

  // Build type slots based on active types — each type gets equal representation
  const activeTypes = [
    ...(useWst ? new Array(7).fill('wst') : []),
    ...(useSit ? new Array(7).fill('situational') : []),
    ...(useTot ? new Array(7).fill('this-or-that') : []),
    ...(useDraw ? new Array(7).fill('drawing') : []),
  ];
  const types = shuffle(activeTypes);
  const picks = [];
  const wstIdx = { i: 0 }; const sitIdx = { i: 0 }; const totIdx = { i: 0 }; const drawIdx = { i: 0 };
  for (const type of types) {
    if (picks.length >= count) break;
    if (type === 'wst' && wstIdx.i < wstPool.length) { picks.push(wstPool[wstIdx.i++]); }
    else if (type === 'situational' && sitIdx.i < sitPool.length) { picks.push(sitPool[sitIdx.i++]); }
    else if (type === 'this-or-that' && totIdx.i < totPool.length) { picks.push(totPool[totIdx.i++]); }
    else if (type === 'drawing' && drawIdx.i < drawPool.length) { picks.push(drawPool[drawIdx.i++]); }
  }
  return picks.slice(0, count);
};

const shuffleAnswers = (answers) => {
  return shuffle([...answers]);
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
  selectSituationalQuestions,
  selectThisOrThatQuestions,
  selectDrawingQuestion,
  selectMixedQuestions,
  shuffleAnswers,
  calculateScores,
  computeStats
};

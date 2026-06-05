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

// Build a mixed question list with exactly one question per selected type, in random order
const selectMixedQuestions = (count, mode, customQuestions = [], selectedTypes = null) => {
  const useWst = !selectedTypes || selectedTypes.includes('who-said-that');
  const useSit = !selectedTypes || selectedTypes.includes('situational');
  const useTot = !selectedTypes || selectedTypes.includes('this-or-that');
  const useDraw = selectedTypes && selectedTypes.includes('drawing');

  const typeSlots = [
    ...(useWst ? ['wst'] : []),
    ...(useSit ? ['situational'] : []),
    ...(useTot ? ['this-or-that'] : []),
    ...(useDraw ? ['drawing'] : []),
  ];

  // If no valid types matched, fall back to WST
  const activeSlots = typeSlots.length > 0 ? typeSlots : ['wst'];
  const effectiveUseWst = useWst || activeSlots.includes('wst');

  // Build one question per slot (repeat pattern if count > number of types)
  const wstPool = effectiveUseWst ? shuffle(mode === 'family' ? familyQuestions : friendsQuestions) : [];
  const sitPool = useSit ? shuffle(situationalQuestions) : [];
  const totPool = useTot ? shuffle(thisOrThatQuestions) : [];
  const drawPool = useDraw ? shuffle(drawingWords) : [];
  const wstIdx = { i: 0 }; const sitIdx = { i: 0 }; const totIdx = { i: 0 }; const drawIdx = { i: 0 };

  // Repeat the shuffled type pattern to fill 'count' slots
  const slots = [];
  const shuffledOnce = shuffle([...activeSlots]);
  for (let i = 0; slots.length < count; i++) {
    slots.push(shuffledOnce[i % shuffledOnce.length]);
  }

  return slots.map(type => {
    if (type === 'wst') {
      const q = wstPool[wstIdx.i++ % wstPool.length];
      return { ...q, type: 'wst' };
    } else if (type === 'situational') {
      const text = sitPool[sitIdx.i++ % sitPool.length];
      return { id: `sit-${Math.random()}`, text, type: 'situational' };
    } else if (type === 'this-or-that') {
      const q = totPool[totIdx.i++ % totPool.length];
      return { id: `tot-${totIdx.i}`, text: q.text, a: q.a, b: q.b, type: 'this-or-that' };
    } else if (type === 'drawing') {
      const word = drawPool[drawIdx.i++ % drawPool.length];
      return { id: `draw-${Math.random()}`, word, type: 'drawing' };
    }
    return null;
  }).filter(Boolean).slice(0, count);
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
      if (vote.isAuthorFakeVote) return;
      
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

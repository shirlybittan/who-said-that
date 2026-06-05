import { describe, it, expect } from 'vitest';
import { gameReducer } from '../gameStore';

describe('gameReducer', () => {
  it('handles MARK_ANSWERED action', () => {
    const initialState = { hasAnswered: false, myAnswer: null };
    const action = { type: 'MARK_ANSWERED', payload: { myAnswer: 'My test answer' } };
    
    const newState = gameReducer(initialState, action);
    
    expect(newState.hasAnswered).toBe(true);
    expect(newState.myAnswer).toBe('My test answer');
  });

  it('handles SET_ANSWERS action', () => {
    const initialState = { answers: [], phase: 'question', currentAnswerIndex: 0 };
    const action = {
      type: 'SET_ANSWERS',
      payload: { answers: [{ text: 'Answer 1' }], currentIndex: 0 }
    };
    
    const newState = gameReducer(initialState, action);
    
    expect(newState.phase).toBe('voting');
    expect(newState.answers.length).toBe(1);
    expect(newState.hasVoted).toBe(false);
  });

  it('handles GAME_SWITCHED action — resets round and per-game state', () => {
    const prevState = {
      gameType: 'who-said-that',
      phase: 'voting',
      hasAnswered: true,
      hasVoted: true,
      answers: [{ text: 'some answer' }],
      currentQuestion: 'Some question?',
      gameEnded: false,
      players: [{ id: 'p1', name: 'Alice' }],
      gameName: 'My Game',
      mlt:  { totalRounds: 5, allowSelfVote: false },
      draw: {},
      fitb: {},
      selfie: {},
      caption: {},
      photoVote: {},
      sit: {},
      tot: {},
      dt: {},
    };

    const action = {
      type: 'GAME_SWITCHED',
      payload: { gameType: 'drawing', players: prevState.players, gameName: 'My Game' },
    };

    const newState = gameReducer(prevState, action);

    expect(newState.gameType).toBe('drawing');
    expect(newState.phase).toBe('lobby');
    expect(newState.hasAnswered).toBe(false);
    expect(newState.hasVoted).toBe(false);
    expect(newState.answers).toEqual([]);
    expect(newState.currentQuestion).toBeNull();
  });

  it('marks draw-telephone prompts as submitted', () => {
    const initialState = {
      dt: { hasSubmittedPrompt: false, promptsSubmittedCount: 1, totalPrompts: 3 },
    };

    const newState = gameReducer(initialState, { type: 'DT_MARK_PROMPT_SUBMITTED' });

    expect(newState.dt.hasSubmittedPrompt).toBe(true);
    expect(newState.dt.promptsSubmittedCount).toBe(1);
  });

  it('handles SELFIE_UPDATE_PROMPT to update drawing prompt', () => {
    const initialState = {
      selfie: {
        promptTemplate: 'Old Prompt',
        currentTurn: { prompt: 'Old Prompt' },
        turn: { prompt: 'Old Prompt' }
      }
    };
    
    const newState = gameReducer(initialState, { type: 'SELFIE_UPDATE_PROMPT', payload: { prompt: 'New Prompt Template' } });

    expect(newState.selfie.promptTemplate).toBe('New Prompt Template');
    expect(newState.selfie.currentTurn.prompt).toBe('New Prompt Template');
    expect(newState.selfie.turn.prompt).toBe('New Prompt Template');
  });
});

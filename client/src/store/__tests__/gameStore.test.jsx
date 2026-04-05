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
});

import React, { Profiler } from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import MiniGameWrapper from '../MiniGameWrapper';
import { GameProvider } from '../../store/gameStore.jsx';

afterEach(cleanup);

function Harness({ tick, onCommit, children }) {
  return (
    <GameProvider>
      <Profiler id="wrapper" onRender={onCommit}>
        <MiniGameWrapper hasConfirmed={false} onConfirm={() => {}}>
          <span>tick {tick}</span>
          {children}
        </MiniGameWrapper>
      </Profiler>
    </GameProvider>
  );
}

describe('MiniGameWrapper', () => {
  // P2-44: the empty check runs after every render; it must not schedule its own
  // renders when nothing changed (that nested loop hit React's update limit).
  it('a parent re-render (timer tick) costs exactly one render', () => {
    let commits = 0;
    const onCommit = () => { commits++; };
    const { rerender } = render(<Harness tick={0} onCommit={onCommit}><input aria-label="answer" /></Harness>);
    const settled = commits;
    for (let t = 1; t <= 20; t++) rerender(<Harness tick={t} onCommit={onCommit}><input aria-label="answer" /></Harness>);
    expect(commits - settled).toBe(20);
  });

  it('reads the empty state from the input when no value is given', () => {
    render(<Harness tick={0} onCommit={() => {}}><input aria-label="answer" /></Harness>);
    const submit = screen.getByTestId('player-answer-submit');
    expect(submit).toBeDisabled();
    fireEvent.input(screen.getByLabelText('answer'), { target: { value: 'hello' } });
    expect(submit).toBeEnabled();
    fireEvent.input(screen.getByLabelText('answer'), { target: { value: '   ' } });
    expect(submit).toBeDisabled();
  });

  it('a canvas phase (no text field) is never empty', () => {
    render(<Harness tick={0} onCommit={() => {}}><canvas /></Harness>);
    expect(screen.getByTestId('player-answer-submit')).toBeEnabled();
  });
});

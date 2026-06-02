import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import MiniGameWrapper from '../MiniGameWrapper';

afterEach(() => {
  cleanup();
});

function MockDrawingGame({ isConfirmed }) {
  return (
    <label>
      Drawing Input
      <input aria-label="Drawing Input" disabled={isConfirmed} />
    </label>
  );
}

function MockCaptionGame({ isConfirmed }) {
  return (
    <label>
      Caption Input
      <textarea aria-label="Caption Input" disabled={isConfirmed} />
    </label>
  );
}

function renderWrapper({
  mode = 'drawing',
  onConfirm = vi.fn(),
  onEditResponse = vi.fn(),
  isHost = false,
  childType = 'drawing',
} = {}) {
  const childByType = {
    drawing: ({ isConfirmed }) => <MockDrawingGame isConfirmed={isConfirmed} />,
    captioning: ({ isConfirmed }) => <MockCaptionGame isConfirmed={isConfirmed} />,
  };

  render(
    <MiniGameWrapper
      mode={mode}
      onConfirm={onConfirm}
      onEditResponse={onEditResponse}
      isHost={isHost}
      adminControls={<button type="button">Skip Round</button>}
    >
      {childByType[childType]}
    </MiniGameWrapper>
  );

  return { onConfirm, onEditResponse };
}

describe('MiniGameWrapper', () => {
  it('shows Confirm and hides waiting state on initial render', () => {
    renderWrapper();

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.queryByText('Waiting for other players...')).not.toBeInTheDocument();
  });

  it('locks inputs, calls submit callback, and shows waiting + edit controls after confirm', async () => {
    const { onConfirm } = renderWrapper({ childType: 'drawing' });

    const drawingInput = screen.getByLabelText('Drawing Input');
    expect(drawingInput).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(drawingInput).toBeDisabled();
    expect(screen.getByText('Waiting for other players...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Response' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  it('returns to editable state when Edit Response is clicked', async () => {
    const { onEditResponse } = renderWrapper({ childType: 'captioning' });

    const captionInput = screen.getByLabelText('Caption Input');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(captionInput).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Response' }));

    expect(onEditResponse).toHaveBeenCalledTimes(1);
    expect(captionInput).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.queryByText('Waiting for other players...')).not.toBeInTheDocument();
  });

  it.each([
    ['drawing', 'drawing', 'Drawing Input'],
    ['captioning', 'captioning', 'Caption Input'],
  ])('renders consistent lifecycle controls for %s mode', async (mode, childType, inputLabel) => {
    renderWrapper({ mode, childType });

    const input = screen.getByLabelText(inputLabel);
    expect(input).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(screen.getByText('Waiting for other players...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Response' })).toBeInTheDocument();
    expect(input).toBeDisabled();
  });

  it('shows admin controls only for hosts', () => {
    const { rerender } = render(
      <MiniGameWrapper mode="drawing" onConfirm={vi.fn()} isHost adminControls={<button type="button">Skip Round</button>}>
        {({ isConfirmed }) => <MockDrawingGame isConfirmed={isConfirmed} />}
      </MiniGameWrapper>
    );

    expect(screen.getByText('Skip Round')).toBeInTheDocument();

    rerender(
      <MiniGameWrapper mode="drawing" onConfirm={vi.fn()} isHost={false} adminControls={<button type="button">Skip Round</button>}>
        {({ isConfirmed }) => <MockDrawingGame isConfirmed={isConfirmed} />}
      </MiniGameWrapper>
    );

    expect(screen.queryByText('Skip Round')).not.toBeInTheDocument();
  });
});

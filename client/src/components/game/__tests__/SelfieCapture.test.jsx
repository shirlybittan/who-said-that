import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SelfieCapture from '../SelfieCapture';

afterEach(() => cleanup());

const SAVED = 'data:image/png;base64,SAVED';

// getByTestId/getByText throw when the element is absent, so a passing call is
// itself the assertion; queryBy* returns null when absent.
describe('SelfieCapture', () => {
  it('shows the explicit reuse choice when a saved photo exists', () => {
    render(<SelfieCapture savedPhoto={SAVED} onSubmit={() => {}} totalPhotographers={3} photoCount={0} />);
    expect(screen.getByTestId('selfie-reuse-choice')).toBeTruthy();
    expect(screen.getByText('Use your previous photo?')).toBeTruthy();
    expect(screen.getByTestId('selfie-reuse-btn')).toBeTruthy();
  });

  it('goes straight to the camera when there is no saved photo', () => {
    render(<SelfieCapture savedPhoto={null} onSubmit={() => {}} />);
    expect(screen.getByTestId('selfie-dropzone')).toBeTruthy();
    expect(screen.queryByTestId('selfie-reuse-choice')).toBeNull();
  });

  it('reuse → preview → submit calls onSubmit with the saved photo', () => {
    const onSubmit = vi.fn();
    render(<SelfieCapture savedPhoto={SAVED} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('selfie-reuse-btn'));
    const submit = screen.getByTestId('selfie-submit-btn');
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith(SAVED);
  });

  it('renders the shared waiting card once submitted', () => {
    render(<SelfieCapture savedPhoto={SAVED} hasSubmitted onSubmit={() => {}} photoCount={2} totalPhotographers={4} />);
    expect(screen.getByTestId('selfie-waiting')).toBeTruthy();
    expect(screen.getByText(/2\/4/)).toBeTruthy();
    expect(screen.queryByTestId('selfie-reuse-choice')).toBeNull();
  });
});

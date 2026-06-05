import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVoteConfirmation } from '../hooks/useVoteConfirmation';

describe('useVoteConfirmation', () => {
  it('holds pending choice and submits only on confirm', () => {
    const onConfirmSubmit = vi.fn();
    const { result } = renderHook(() => useVoteConfirmation({ onConfirmSubmit, resetKey: 'r1' }));

    act(() => {
      result.current.choose({ id: 'p1' });
    });

    expect(result.current.pending).toEqual({ id: 'p1' });
    expect(onConfirmSubmit).not.toHaveBeenCalled();

    act(() => {
      result.current.confirm();
    });

    expect(onConfirmSubmit).toHaveBeenCalledWith({ id: 'p1' });
    expect(result.current.confirmed).toBe(true);
  });

  it('resets selection on resetKey change', () => {
    const { result, rerender } = renderHook(
      ({ keyValue }) => useVoteConfirmation({ onConfirmSubmit: vi.fn(), resetKey: keyValue }),
      { initialProps: { keyValue: 'r1' } }
    );

    act(() => {
      result.current.choose({ id: 'p2' });
    });
    expect(result.current.pending).toEqual({ id: 'p2' });

    rerender({ keyValue: 'r2' });

    expect(result.current.pending).toBe(null);
    expect(result.current.confirmed).toBe(false);
  });
});

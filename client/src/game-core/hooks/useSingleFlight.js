import { useCallback, useRef } from 'react';

/**
 * Returns `guard(fn)`: a wrapper that lets `fn` run at most once per `ms`
 * window, across ALL functions wrapped by the same hook instance.
 *
 * Host "advance" buttons (Next answer / Next round / Show results / Skip) use
 * this so a double-click can't send two advance requests. The server also
 * rejects stale advances (AUDIT.md P1-01); this is the UX half.
 */
export default function useSingleFlight(ms = 1000) {
  const lastRef = useRef(0);
  return useCallback((fn) => {
    if (typeof fn !== 'function') return fn;
    return (...args) => {
      const now = Date.now();
      if (now - lastRef.current < ms) return undefined;
      lastRef.current = now;
      return fn(...args);
    };
  }, [ms]);
}

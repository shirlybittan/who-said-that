import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Manages fullscreen state for a container element.
 * Returns `{ isFullscreen, containerRef, toggleFullscreen }`.
 *
 * @param {string} [orientationLock='landscape'] - Orientation to lock when entering
 *   fullscreen. Pass `null` to skip orientation locking.
 */
export function useFullscreen(orientationLock = 'landscape') {
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => {
        setIsFullscreen(true);
        if (orientationLock && screen.orientation?.lock) {
          screen.orientation.lock(orientationLock).catch(() => {});
        }
      }).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, [orientationLock]);

  return { isFullscreen, containerRef, toggleFullscreen };
}

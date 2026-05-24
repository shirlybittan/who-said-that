import React, { useRef, useEffect } from 'react';
import { drawStroke, redrawCanvas, redrawOverlay, CANVAS_W, CANVAS_H } from '../../utils/canvasUtils';

/**
 * Canvas that replays a strokes array.
 *
 * Props:
 *  strokes    – array of stroke objects to replay
 *  photoData  – optional base64 image URL; when provided the canvas is
 *               transparent and overlaid on top of the photo (selfie mode)
 *  cssWidth   – rendered CSS width (default 180)
 *  cssHeight  – rendered CSS height (default 135)
 *  className  – extra CSS classes for the wrapper
 */
export default function ReplayCanvas({
  strokes = [],
  photoData = null,
  cssWidth = 180,
  cssHeight = 135,
  className = '',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (photoData) {
      redrawOverlay(canvas, strokes);
    } else {
      redrawCanvas(canvas, strokes);
    }
  }, [strokes, photoData]);

  if (photoData) {
    return (
      <div
        className={`relative overflow-hidden ${className}`}
        style={{ width: cssWidth, height: cssHeight }}
      >
        <img
          src={photoData}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ width: cssWidth, height: cssHeight }}
      className={`block ${className}`}
    />
  );
}

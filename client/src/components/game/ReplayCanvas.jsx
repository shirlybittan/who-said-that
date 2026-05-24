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
 *  cssHeight  – rendered CSS height; if omitted the container uses the canvas
 *               aspect ratio (CANVAS_W:CANVAS_H = 4:3) to avoid cropping photos
 *  className  – extra CSS classes for the wrapper
 */
export default function ReplayCanvas({
  strokes = [],
  photoData = null,
  cssWidth = 180,
  cssHeight = undefined,
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

  // When cssHeight is not provided, maintain the canvas 4:3 aspect ratio.
  // When cssHeight is explicit, honour it (may crop but keeps existing thumbnail layouts).
  const sizeStyle = cssHeight !== undefined
    ? { width: cssWidth, height: cssHeight }
    : { width: cssWidth, aspectRatio: `${CANVAS_W}/${CANVAS_H}` };

  if (photoData) {
    return (
      <div
        className={`relative overflow-hidden ${className}`}
        style={sizeStyle}
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
      style={sizeStyle}
      className={`block ${className}`}
    />
  );
}

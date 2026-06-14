export const CANVAS_W = 400;
export const CANVAS_H = 300;

/**
 * Returns optimal canvas pixel dimensions based on device screen width and DPR.
 * Maintains the 4:3 aspect ratio used throughout the app.
 *
 * Small phones  (<400px wide)  → 600×450
 * Default phones (400–767px)   → 800×600
 * Tablets / large (≥768px)     → 1200×900
 *
 * Note: the returned values are the canvas *pixel buffer* size — the element
 * is still sized via CSS (width: 100%). Higher resolution means more detail
 * at the cost of slightly more memory.
 */
export function getOptimalCanvasSize() {
  const w = window.innerWidth;
  if (w < 400) return { width: 600,  height: 450  };
  if (w < 768) return { width: 800,  height: 600  };
  return              { width: 1200, height: 900  };
}

/**
 * Draw a single stroke onto a canvas 2D context.
 * Uses ctx.save/restore so composite operations don't leak.
 * Eraser uses destination-out (true transparency), all other tools use source-over.
 */
export function drawStroke(ctx, stroke) {
  if (!stroke?.points?.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (stroke.type === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
  }
  if (stroke.points.length === 1) {
    ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Clear and redraw an opaque (white-background) canvas from a strokes array.
 * Used for Sketch It! drawing and replay.
 */
export function redrawCanvas(canvas, strokes, { bgColor = '#FFFFFF' } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  strokes.forEach(s => drawStroke(ctx, s));
}

/**
 * Clear and redraw a transparent-background overlay canvas from a strokes array.
 * Used for Selfie Draw (drawing on top of a photo).
 */
export function redrawOverlay(canvas, strokes) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach(s => drawStroke(ctx, s));
}

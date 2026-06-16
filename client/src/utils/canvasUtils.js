export const CANVAS_W = 800;
export const CANVAS_H = 600;

/**
 * Draw a single stroke onto a canvas 2D context.
 * Uses ctx.save/restore so composite operations don't leak.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} stroke
 * @param {object} [opts]
 * @param {string|null} [opts.eraserColor] - If provided (e.g. '#FFFFFF'), the eraser
 *   paints that solid color (for opaque canvases). If null/omitted, uses
 *   destination-out (true transparency, for overlay-on-photo canvases).
 */
export function drawStroke(ctx, stroke, { eraserColor = null } = {}) {
  if (!stroke?.points?.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (stroke.type === 'eraser') {
    if (eraserColor) {
      // Opaque canvas: paint the background color to simulate erasing
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = eraserColor;
      ctx.fillStyle = eraserColor;
    } else {
      // Transparent overlay on photo: cut through to reveal photo underneath
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    }
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
 * Eraser strokes are rendered as white paint so they erase correctly on the
 * opaque background.
 * Used for Sketch It! drawing and replay.
 */
export function redrawCanvas(canvas, strokes, { bgColor = '#FFFFFF' } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  strokes.forEach(s => drawStroke(ctx, s, { eraserColor: bgColor }));
}

/**
 * Clear and redraw a transparent-background overlay canvas from a strokes array.
 * Eraser strokes use destination-out to reveal the photo underneath.
 * Used for Selfie Draw (drawing on top of a photo).
 */
export function redrawOverlay(canvas, strokes) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // eraserColor omitted → destination-out (cuts through to reveal the selfie)
  strokes.forEach(s => drawStroke(ctx, s));
}

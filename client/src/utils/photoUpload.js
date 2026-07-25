// Shared photo upload path for every selfie/photo mini-game.
//
// When the server has cloud storage configured, the client PUTs the image binary
// straight to a presigned URL and the game only ever sends a small public URL
// over the socket — keeping multi-MB base64 blobs out of server room state and
// the persistence snapshot. When storage isn't configured (or anything fails),
// it transparently falls back to the original base64-over-socket flow, so dev
// and un-configured deployments behave exactly as before.

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// Attempt a presigned PUT upload. Returns the public URL, or null to signal the
// caller should fall back to base64.
async function tryCloudUpload(dataUrl, { roomCode, playerId, uploadToken }) {
  const mimeMatch = dataUrl.match(/^data:(image\/[a-z]+);base64,/);
  if (!mimeMatch) return null; // not a base64 data URI (e.g. already a URL) — nothing to upload
  const mimeType = mimeMatch[1];
  try {
    const res = await fetch(`${SERVER_URL}/api/upload-photo-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, playerId, mimeType, uploadToken }),
    });
    if (!res.ok) return null; // 503 = storage not configured; 401/403 = bad token

    const { uploadUrl, publicUrl } = await res.json();
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });

    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob });
    if (!putRes.ok) return null;
    return publicUrl;
  } catch {
    return null; // network error — fall back to base64
  }
}

/**
 * Resolve a captured photo to what should be sent over the socket:
 *   - a cloud public URL when storage is configured and the upload succeeds
 *   - otherwise the original base64 data URL (fallback)
 * A value that is already a URL (not a data: URI) is returned unchanged, so
 * reusing a previously-uploaded photo doesn't re-upload it.
 *
 * @param {string} dataUrl  base64 data URI (or an existing URL)
 * @param {{roomCode:string, playerId:string, uploadToken:string}} ctx
 * @returns {Promise<string>} URL or base64 to emit
 */
export async function uploadPhoto(dataUrl, ctx) {
  if (!dataUrl) return dataUrl;
  const cloudUrl = await tryCloudUpload(dataUrl, ctx || {});
  return cloudUrl || dataUrl;
}

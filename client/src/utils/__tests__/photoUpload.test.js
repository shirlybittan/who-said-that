import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadPhoto } from '../photoUpload';

const DATA_URI = 'data:image/jpeg;base64,' + btoa('hello-bytes');
const CTX = { roomCode: 'ABCD', playerId: 'p1', uploadToken: 'tok' };

afterEach(() => vi.unstubAllGlobals());

describe('uploadPhoto', () => {
  it('passes through a value that is already a URL (no re-upload)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await uploadPhoto('https://cdn.example.com/pic.jpg', CTX);
    expect(out).toBe('https://cdn.example.com/pic.jpg');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to base64 when storage is not configured (503)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const out = await uploadPhoto(DATA_URI, CTX);
    expect(out).toBe(DATA_URI);
  });

  it('falls back to base64 on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const out = await uploadPhoto(DATA_URI, CTX);
    expect(out).toBe(DATA_URI);
  });

  it('returns the cloud public URL when the presigned upload succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ uploadUrl: 'https://put.example/sig', publicUrl: 'https://cdn.example/rooms/ABCD/p1.jpg' }) })
      .mockResolvedValueOnce({ ok: true }); // the PUT
    vi.stubGlobal('fetch', fetchMock);
    const out = await uploadPhoto(DATA_URI, CTX);
    expect(out).toBe('https://cdn.example/rooms/ABCD/p1.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // first call posts to the presign endpoint with the token
    expect(fetchMock.mock.calls[0][0]).toContain('/api/upload-photo-url');
    // second call PUTs the binary to the presigned url
    expect(fetchMock.mock.calls[1][0]).toBe('https://put.example/sig');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
  });

  it('falls back to base64 if the PUT itself fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ uploadUrl: 'https://put.example/sig', publicUrl: 'https://cdn/x.jpg' }) })
      .mockResolvedValueOnce({ ok: false, status: 500 }); // PUT fails
    vi.stubGlobal('fetch', fetchMock);
    const out = await uploadPhoto(DATA_URI, CTX);
    expect(out).toBe(DATA_URI);
  });
});

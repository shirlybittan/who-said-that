import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadPhoto, submitPhoto, _resetUploadConfig } from '../photoUpload';

const DATA_URI = 'data:image/jpeg;base64,' + btoa('hello-bytes');
const CTX = { roomCode: 'ABCD', playerId: 'p1', uploadToken: 'tok' };
const CONFIG_ON = { ok: true, json: async () => ({ enabled: true }) };
const CONFIG_OFF = { ok: true, json: async () => ({ enabled: false }) };

afterEach(() => { vi.unstubAllGlobals(); _resetUploadConfig(); });

describe('uploadPhoto', () => {
  it('passes through a value that is already a URL (no re-upload)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await uploadPhoto('https://cdn.example.com/pic.jpg', CTX);
    expect(out).toBe('https://cdn.example.com/pic.jpg');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('storage off: asks once, never calls the presign endpoint (no logged 503, P3-04)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(CONFIG_OFF);
    vi.stubGlobal('fetch', fetchMock);
    expect(await uploadPhoto(DATA_URI, CTX)).toBe(DATA_URI);
    expect(await uploadPhoto(DATA_URI, CTX)).toBe(DATA_URI);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/upload-config');
  });

  it('falls back to base64 when the presign endpoint refuses (503)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(CONFIG_ON).mockResolvedValue({ ok: false, status: 503 }));
    expect(await uploadPhoto(DATA_URI, CTX)).toBe(DATA_URI);
  });

  it('falls back to base64 on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await uploadPhoto(DATA_URI, CTX)).toBe(DATA_URI);
  });

  it('returns the cloud public URL when the presigned upload succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(CONFIG_ON)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ uploadUrl: 'https://put.example/sig', publicUrl: 'https://cdn.example/rooms/ABCD/p1.jpg' }) })
      .mockResolvedValueOnce({ ok: true }); // the PUT
    vi.stubGlobal('fetch', fetchMock);
    const out = await uploadPhoto(DATA_URI, CTX);
    expect(out).toBe('https://cdn.example/rooms/ABCD/p1.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain('/api/upload-photo-url');
    expect(fetchMock.mock.calls[2][0]).toBe('https://put.example/sig');
    expect(fetchMock.mock.calls[2][1].method).toBe('PUT');
    expect(fetchMock.mock.calls[2][1].signal).toBeDefined(); // has a deadline
  });

  it('falls back to base64 if the PUT itself fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(CONFIG_ON)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ uploadUrl: 'https://put.example/sig', publicUrl: 'https://cdn/x.jpg' }) })
      .mockResolvedValueOnce({ ok: false, status: 500 }); // PUT fails
    vi.stubGlobal('fetch', fetchMock);
    expect(await uploadPhoto(DATA_URI, CTX)).toBe(DATA_URI);
  });
});

describe('submitPhoto (P3-16)', () => {
  const fakeSocket = (impl) => ({ timeout: vi.fn(() => ({ emitWithAck: impl })) });

  it('resolves when the server accepts the photo', async () => {
    const sock = fakeSocket(vi.fn().mockResolvedValue({ ok: true }));
    await expect(submitPhoto(sock, 'selfie:submit_photo', { code: 'ABCD' })).resolves.toEqual({ ok: true });
  });

  it('throws when the server refuses it', async () => {
    const sock = fakeSocket(vi.fn().mockResolvedValue({ ok: false }));
    await expect(submitPhoto(sock, 'selfie:submit_photo', {})).rejects.toThrow('photo_rejected');
  });

  it('throws when the server does not answer in time', async () => {
    const sock = fakeSocket(vi.fn().mockRejectedValue(new Error('operation has timed out')));
    await expect(submitPhoto(sock, 'caption:submit_photo', {})).rejects.toThrow();
  });
});

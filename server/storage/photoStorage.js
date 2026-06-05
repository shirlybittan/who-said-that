/**
 * photoStorage.js
 *
 * Provides presigned upload URLs so clients can PUT photo binaries directly
 * to cloud storage (AWS S3 or Cloudflare R2) instead of sending Base64 blobs
 * over Socket.io.
 *
 * Required environment variables (when STORAGE_PROVIDER is set):
 *
 *   STORAGE_PROVIDER   = 's3' | 'r2'
 *
 *   For S3:
 *     AWS_REGION          (e.g. us-east-1)
 *     AWS_ACCESS_KEY_ID
 *     AWS_SECRET_ACCESS_KEY
 *     S3_BUCKET           (bucket name)
 *     S3_PUBLIC_BASE_URL  (optional — public URL base; defaults to https://<bucket>.s3.<region>.amazonaws.com)
 *
 *   For Cloudflare R2:
 *     R2_ACCOUNT_ID
 *     R2_ACCESS_KEY_ID
 *     R2_SECRET_ACCESS_KEY
 *     R2_BUCKET
 *     R2_PUBLIC_BASE_URL  (e.g. https://pub-<hash>.r2.dev or a custom domain)
 *
 * If STORAGE_PROVIDER is not set, `isConfigured()` returns false and the
 * server falls back to the existing Base64-over-socket flow.
 */

const { randomUUID } = require('crypto');

let S3Client, PutObjectCommand, getSignedUrl;

const PROVIDER = (process.env.STORAGE_PROVIDER || '').toLowerCase();

// Lazy-load AWS SDK only when actually needed so non-storage deployments
// don't crash if the package is not installed.
const loadAwsSdk = () => {
  if (S3Client) return true;
  try {
    ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
    ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
    return true;
  } catch {
    return false;
  }
};

/**
 * Returns true when storage is configured and the AWS SDK is available.
 */
const isConfigured = () => {
  if (!PROVIDER) return false;
  return loadAwsSdk();
};

const buildS3Client = () => {
  if (PROVIDER === 'r2') {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  // Default: AWS S3
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
};

const getBucket = () =>
  PROVIDER === 'r2' ? process.env.R2_BUCKET : process.env.S3_BUCKET;

const getPublicBaseUrl = () => {
  if (PROVIDER === 'r2') return (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (process.env.S3_PUBLIC_BASE_URL) return process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, '');
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION || 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com`;
};

/**
 * Generate a presigned PUT URL for a player selfie.
 *
 * @param {string} roomCode   - 4-letter room code (used as a path prefix)
 * @param {string} playerId   - player UUID
 * @param {string} mimeType   - 'image/jpeg' | 'image/png' | 'image/webp'
 * @returns {{ uploadUrl: string, publicUrl: string, objectKey: string }}
 */
const createPresignedUpload = async (roomCode, playerId, mimeType = 'image/jpeg') => {
  if (!isConfigured()) throw new Error('Storage not configured');

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const objectKey = `rooms/${roomCode}/${playerId}-${randomUUID()}.${ext}`;
  const bucket = getBucket();

  const client = buildS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: mimeType,
    // Limit upload size server-side via conditions when using post policy,
    // but for presigned PUT we rely on Content-Length header sent by client.
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 }); // 5-minute window
  const publicUrl = `${getPublicBaseUrl()}/${objectKey}`;

  return { uploadUrl, publicUrl, objectKey };
};

module.exports = { isConfigured, createPresignedUpload, getPublicBaseUrl };

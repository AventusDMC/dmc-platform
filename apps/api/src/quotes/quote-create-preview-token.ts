import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Quote Builder V2 Slice 2C — OPAQUE create-preview token (activity item-create only).
 *
 * Unlike the shared apply-path token (`quote-preview-token.ts`), which is
 * base64url JSON + HMAC (signed but READABLE), this token's payload is ENCRYPTED
 * (AES-256-GCM) so a restricted client cannot base64-decode it and read the
 * projected cost/margin it carries for the server-side drift compare. The client
 * only replays the opaque token; the server decrypts it.
 *
 * The shared apply-path `buildPreviewToken` / `verifyPreviewToken` are NOT touched.
 * The key is derived from the existing `QUOTE_PREVIEW_TOKEN_SECRET` (no new env
 * var). GCM's auth tag provides tamper protection (no separate HMAC needed);
 * expiry + identity binding + snapshot mismatch remain the caller's checks, exactly
 * as before — this only changes the wire form from readable to opaque.
 *
 * Format: `v2c.<base64url(iv)>.<base64url(authTag)>.<base64url(ciphertext)>`.
 */

const TOKEN_VERSION = 'v2c';

function deriveKey(secret: string): Buffer {
  // 32-byte AES-256 key deterministically derived from the shared token secret.
  return createHash('sha256').update(String(secret)).digest();
}

export function buildCreatePreviewToken(payload: Record<string, unknown>, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    TOKEN_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Decrypt + verify. Returns the decoded payload, or `null` when the token is
 * malformed, tampered (GCM auth failure), or otherwise undecryptable. Expiry and
 * field binding are checked by the caller (unchanged from the apply flow).
 */
export function verifyCreatePreviewToken(token: unknown, secret: string): Record<string, any> | null {
  if (typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) {
    return null;
  }
  try {
    const [, ivB64, tagB64, dataB64] = parts;
    const key = deriveKey(secret);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as Record<string, any>;
  } catch {
    // Tampered / wrong key / malformed → treated as invalid (caller returns invalid_preview_token).
    return null;
  }
}

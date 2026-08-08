import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Stateless, OPAQUE preview token for the pricing preview → apply guard (PR4;
 * Slice B).
 *
 * Format: `v2s.<base64url(iv)>.<base64url(authTag)>.<base64url(ciphertext)>`.
 * The canonical payload is ENCRYPTED with AES-256-GCM (key derived from the
 * existing QUOTE_PREVIEW_TOKEN_SECRET), so a restricted client can no longer
 * base64-decode the token to read the projected cost it carries. GCM's auth tag
 * provides tamper protection (it replaces the previous HMAC-SHA256 signature).
 *
 * The token is computed at preview time and replayed at apply time; nothing is
 * persisted (no schema change). The apply path re-derives the same snapshot from
 * live state and compares it to the (decrypted, authenticated) token payload to
 * detect staleness. The token deliberately does NOT carry the user's role — role
 * is re-checked live at apply time.
 *
 * Slice B is a CLEAN CUT: only the `v2s` opaque format is accepted. The previous
 * readable `v1.<seg>.<sig>` format is rejected (returns null → invalid_preview_token),
 * so an in-flight v1 token fails closed and the user simply re-previews. Tokens are
 * never persisted, so there is nothing to migrate. This is DISTINCT from the Slice
 * 2C activity-create token (`quote-create-preview-token.ts`, `v2c` prefix), which is
 * unchanged.
 */

const TOKEN_VERSION = 'v2s';

export function getPreviewTokenSecret(): string {
  // Mirrors the auth session-secret pattern: env override with a dev fallback.
  // IMPORTANT: the dev fallback is for local/test only. When the apply guard is
  // enabled in production a real QUOTE_PREVIEW_TOKEN_SECRET MUST be set — the
  // apply endpoint refuses to operate on the dev fallback in production (see
  // isPreviewTokenSecretConfigured + the NODE_ENV check in applyPreviewQuoteItem).
  return process.env.QUOTE_PREVIEW_TOKEN_SECRET || 'dmc-local-dev-preview-token-secret';
}

/** True only when an explicit (non-fallback) token secret is configured. */
export function isPreviewTokenSecretConfigured(): boolean {
  return Boolean(process.env.QUOTE_PREVIEW_TOKEN_SECRET && process.env.QUOTE_PREVIEW_TOKEN_SECRET.trim());
}

// Deterministic canonical JSON: object keys sorted, `undefined` dropped, Dates
// serialized via their ISO form. Ensures preview and apply hash/sign identically.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        if (source[key] !== undefined) {
          acc[key] = canonicalize(source[key]);
        }
        return acc;
      }, {});
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value ?? {}));
}

/** Stable hash of the (normalized) edit payload, embedded in the token. */
export function normalizePayloadHash(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

// 32-byte AES-256 key deterministically derived from the shared token secret.
// Mirrors the Slice 2C create-token helper — same secret, no new env var.
function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(String(secret)).digest();
}

export function buildPreviewToken(payload: Record<string, unknown>, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  // Encrypt the SAME canonical JSON that used to be base64-signed, so the payload
  // shape is unchanged — only the encoding (readable → opaque) changes.
  const plaintext = Buffer.from(canonicalJson(payload), 'utf8');
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
 * Decrypt + authenticate. Returns the decoded payload, or null when the token is
 * malformed, the wrong version, or tampered/undecryptable (GCM auth failure or
 * wrong key). Expiry and field binding are checked by the caller (unchanged).
 * Clean cut: the legacy readable `v1` format is not accepted.
 */
export function verifyPreviewToken(token: unknown, secret: string): Record<string, any> | null {
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
    // Tampered / wrong key / malformed → invalid (caller returns invalid_preview_token).
    return null;
  }
}

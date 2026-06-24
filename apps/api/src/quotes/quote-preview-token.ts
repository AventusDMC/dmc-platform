import { createHash, createHmac } from 'node:crypto';

/**
 * Stateless, signed preview token for the pricing preview → apply guard (PR4).
 *
 * Format: `v1.<base64url(canonical payload)>.<HMAC-SHA256(segment, secret)>`.
 * The token is computed at preview time and replayed at apply time; nothing is
 * persisted (no schema change). The apply path re-derives the same snapshot from
 * live state and compares it to the (signature-verified) token payload to detect
 * staleness. The token deliberately does NOT carry the user's role — role is
 * re-checked live at apply time.
 */

const TOKEN_VERSION = 'v1';

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

export function buildPreviewToken(payload: Record<string, unknown>, secret: string): string {
  const segment = Buffer.from(canonicalJson(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(segment).digest('hex');
  return `${TOKEN_VERSION}.${segment}.${signature}`;
}

/**
 * Verify the signature + structure. Returns the decoded payload, or null when
 * the token is malformed or the signature does not match. Expiry and field
 * binding are checked by the caller.
 */
export function verifyPreviewToken(token: unknown, secret: string): Record<string, any> | null {
  if (typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    return null;
  }
  const [, segment, signature] = parts;
  const expected = createHmac('sha256', secret).update(segment).digest('hex');
  if (signature.length !== expected.length) {
    return null;
  }
  // Constant-time comparison.
  let diff = 0;
  for (let i = 0; i < signature.length; i += 1) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, any>;
  } catch {
    return null;
  }
}

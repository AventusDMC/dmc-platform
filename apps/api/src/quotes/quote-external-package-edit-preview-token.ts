import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * ERP V2 — E-a: OPAQUE external-package EDIT preview token.
 *
 * FULLY ISOLATED from every other quote token:
 *  - the shared apply-path token (`quote-preview-token.ts`, prefix `v2s`) — used by
 *    the PRODUCTION-ENABLED pricing-apply flow — is NOT touched or read here; and
 *  - the create/delete token (`quote-create-preview-token.ts`, prefix `v2c`) is a
 *    SEPARATE module — this edit token uses its OWN prefix `v2e` so a `v2c` create/
 *    delete token can never authorize an edit, an edit token can never authorize a
 *    create/delete, and neither can be replayed against the `v2s` pricing-apply flow
 *    (each verifier rejects a foreign prefix before decrypting).
 *
 * Like `v2c`, the payload is ENCRYPTED (AES-256-GCM) so a restricted client cannot
 * base64-decode the projected cost/margin it carries for the server-side drift
 * compare — the client only replays the opaque token; the server decrypts it. The
 * key is derived from the existing `QUOTE_PREVIEW_TOKEN_SECRET` (no new env var).
 * GCM's auth tag provides tamper protection; expiry + identity binding + snapshot +
 * payload-hash checks remain the caller's (mirrors the create/delete guard).
 *
 * Format: `v2e.<base64url(iv)>.<base64url(authTag)>.<base64url(ciphertext)>`.
 */

// Dedicated prefix — the isolation boundary. Distinct from `v2s` (apply) and `v2c`
// (create/delete). A token with any other prefix is rejected before decryption.
const TOKEN_VERSION = 'v2e';

// Semantic kind carried INSIDE the (encrypted) payload — the caller asserts it after
// verify. A second isolation layer on top of the prefix: even a future `v2e` token for
// a different edit operation would carry a different kind.
export const EXTERNAL_PACKAGE_EDIT_TOKEN_KIND = 'external-package-edit';

function deriveKey(secret: string): Buffer {
  // 32-byte AES-256 key deterministically derived from the shared token secret.
  return createHash('sha256').update(String(secret)).digest();
}

export function buildExternalPackageEditToken(payload: Record<string, unknown>, secret: string): string {
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
 * malformed, carries the wrong prefix (an `v2s`/`v2c` token → rejected here), is
 * tampered (GCM auth failure), or is otherwise undecryptable. Expiry, identity,
 * kind, snapshot, and payload-hash binding are checked by the caller.
 */
export function verifyExternalPackageEditToken(token: unknown, secret: string): Record<string, any> | null {
  if (typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) {
    // Wrong prefix (e.g. a `v2s` apply token or a `v2c` create/delete token) or
    // malformed → invalid. Cross-op isolation is enforced right here.
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

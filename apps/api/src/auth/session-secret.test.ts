const sessionSecretTest = require('node:test');
const sessionSecretAssert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { AuthService } = require('./auth.service');

const DEV_FALLBACK_SECRET = 'dmc-local-dev-session-secret';

function createService() {
  // getSessionSecret / verifySessionToken do not touch Prisma.
  return new AuthService({} as any);
}

function forgeToken(secret: string) {
  const payload = {
    sub: 'user-1',
    email: 'admin@example.com',
    role: 'admin',
    firstName: 'A',
    lastName: 'B',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const segment = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(segment).digest('hex');
  return `v1.${segment}.${signature}`;
}

function withEnv(nodeEnv: string | undefined, secret: string | undefined, fn: () => void) {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevSecret = process.env.DMC_AUTH_SESSION_SECRET;
  if (nodeEnv === undefined) delete (process.env as any).NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  if (secret === undefined) delete (process.env as any).DMC_AUTH_SESSION_SECRET;
  else process.env.DMC_AUTH_SESSION_SECRET = secret;
  try {
    fn();
  } finally {
    if (prevNodeEnv === undefined) delete (process.env as any).NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevSecret === undefined) delete (process.env as any).DMC_AUTH_SESSION_SECRET;
    else process.env.DMC_AUTH_SESSION_SECRET = prevSecret;
  }
}

sessionSecretTest.test('fails closed in production when DMC_AUTH_SESSION_SECRET is missing (no dev fallback)', () => {
  withEnv('production', undefined, () => {
    const service = createService();
    const tokenForgedWithDevSecret = forgeToken(DEV_FALLBACK_SECRET);
    // Must NOT authenticate via the public in-repo fallback; signing throws instead.
    sessionSecretAssert.throws(
      () => service.verifySessionToken(tokenForgedWithDevSecret),
      /DMC_AUTH_SESSION_SECRET is not configured/,
    );
  });
});

sessionSecretTest.test('uses the dev fallback secret outside production (local/test convenience)', () => {
  withEnv('test', undefined, () => {
    const service = createService();
    const tokenForgedWithDevSecret = forgeToken(DEV_FALLBACK_SECRET);
    const actor = service.verifySessionToken(tokenForgedWithDevSecret);
    sessionSecretAssert.equal(actor.email, 'admin@example.com');
    sessionSecretAssert.equal(actor.role, 'admin');
  });
});

sessionSecretTest.test('uses the configured secret in production when present', () => {
  withEnv('production', 'a-real-production-secret', () => {
    const service = createService();
    // A token forged with the public dev fallback must be rejected, not accepted.
    const tokenForgedWithDevSecret = forgeToken(DEV_FALLBACK_SECRET);
    sessionSecretAssert.throws(
      () => service.verifySessionToken(tokenForgedWithDevSecret),
      /Invalid session token/,
    );
    // A token signed with the real configured secret verifies.
    const tokenForgedWithRealSecret = forgeToken('a-real-production-secret');
    const actor = service.verifySessionToken(tokenForgedWithRealSecret);
    sessionSecretAssert.equal(actor.role, 'admin');
  });
});

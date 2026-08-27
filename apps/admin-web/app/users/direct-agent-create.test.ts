const test = require('node:test');
const assert = require('node:assert/strict');

const { isStagingDirectAgentCreateEnabled } = require('./direct-agent-create-flag') as typeof import('./direct-agent-create-flag');
const { validateDirectAgentForm, buildDirectAgentRequestBody } = require('./direct-agent-create-logic') as typeof import('./direct-agent-create-logic');

const FLAG = 'ENABLE_STAGING_DIRECT_AGENT_CREATE';
const SYNTH_PASSWORD = 'SYNTHETIC-Passw0rd!';

function setFlag(value: string | undefined) {
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
}

test('flag helper: enabled ONLY for exactly "true"', () => {
  const prev = process.env[FLAG];
  try {
    setFlag(undefined);
    assert.equal(isStagingDirectAgentCreateEnabled(), false);
    setFlag('');
    assert.equal(isStagingDirectAgentCreateEnabled(), false);
    setFlag('false');
    assert.equal(isStagingDirectAgentCreateEnabled(), false);
    setFlag('TRUE');
    assert.equal(isStagingDirectAgentCreateEnabled(), false);
    setFlag('1');
    assert.equal(isStagingDirectAgentCreateEnabled(), false);
    setFlag('true');
    assert.equal(isStagingDirectAgentCreateEnabled(), true);
  } finally {
    setFlag(prev);
  }
});

test('validation: rejects missing name/email/password and mismatched confirmation', () => {
  assert.equal(validateDirectAgentForm({ name: '', email: 'a@b.test', password: 'p', confirmPassword: 'p' }).ok, false);
  assert.equal(validateDirectAgentForm({ name: 'N', email: '', password: 'p', confirmPassword: 'p' }).ok, false);
  assert.equal(validateDirectAgentForm({ name: 'N', email: 'a@b.test', password: '', confirmPassword: '' }).ok, false);
  assert.equal(validateDirectAgentForm({ name: 'N', email: 'a@b.test', password: '   ', confirmPassword: '   ' }).ok, false);
  assert.equal(validateDirectAgentForm({ name: 'N', email: 'a@b.test', password: 'p', confirmPassword: 'q' }).ok, false);
  assert.equal(validateDirectAgentForm({ name: 'N', email: 'a@b.test', password: SYNTH_PASSWORD, confirmPassword: SYNTH_PASSWORD }).ok, true);
});

test('request body builder: only name/email/password/confirmPassword — never role/company/active', () => {
  const body = buildDirectAgentRequestBody({ name: '  UAT Agent ', email: '  a@b.test ', password: SYNTH_PASSWORD, confirmPassword: SYNTH_PASSWORD });
  assert.deepEqual(Object.keys(body).sort(), ['confirmPassword', 'email', 'name', 'password']);
  assert.equal('role' in (body as Record<string, unknown>), false);
  assert.equal('companyId' in (body as Record<string, unknown>), false);
  assert.equal('active' in (body as Record<string, unknown>), false);
  assert.equal(body.name, 'UAT Agent');
  assert.equal(body.email, 'a@b.test');
});

export {};

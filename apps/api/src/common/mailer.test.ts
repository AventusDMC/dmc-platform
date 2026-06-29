import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  getEmailProvider,
  isRealMailConfigured,
  isSmtpConfigured,
  toResendAttachments,
  sendViaResend,
  sendConfiguredEmail,
} from './mailer';

const EMAIL_KEYS = [
  'EMAIL_PROVIDER',
  'RESEND_API_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_HTTP_TIMEOUT_MS',
];

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of EMAIL_KEYS) saved[k] = process.env[k];
  for (const k of EMAIL_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  const restore = () => {
    for (const k of EMAIL_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
  const r = fn();
  if (r instanceof Promise) return r.finally(restore);
  restore();
  return r;
}

function withFetch(stub: (url: string, init: any) => Promise<any>, fn: () => Promise<void>) {
  const orig = globalThis.fetch;
  (globalThis as any).fetch = stub;
  return fn().finally(() => { (globalThis as any).fetch = orig; });
}

// ---- provider selection ----
test('getEmailProvider: resend only when key present; else null', async () => {
  await withEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test' }, () => {
    assert.equal(getEmailProvider(), 'resend');
    assert.equal(isRealMailConfigured(), true);
  });
  // 3. resend selected but NO key -> null (falls back, no real-send)
  await withEnv({ EMAIL_PROVIDER: 'resend' }, () => {
    assert.equal(getEmailProvider(), null);
    assert.equal(isRealMailConfigured(), false);
  });
  await withEnv({}, () => {
    assert.equal(getEmailProvider(), null);
    assert.equal(isRealMailConfigured(), false);
    assert.equal(isSmtpConfigured(), false);
  });
});

// ---- 1. no provider + no SMTP -> dry-run (stream) ----
test('no provider + no SMTP -> dry-run stream send (composed, not delivered)', async () => {
  await withEnv({}, async () => {
    const info = await sendConfiguredEmail(
      { from: 'a@x.com', to: 'b@y.com', subject: 'Hi', text: 'Body' },
      { quoteId: 'q1', action: 'quote.proposal.email' },
    );
    // streamTransport returns a messageId + buffered message, delivers nothing
    assert.ok('messageId' in info);
    assert.equal((info as any).provider, undefined); // not the resend path
  });
});

// ---- 2. SMTP backward-compat: selection picks SMTP path, not resend ----
test('SMTP_HOST set + no provider -> real-configured, resend NOT selected', async () => {
  await withEnv({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587' }, () => {
    assert.equal(getEmailProvider(), null);
    assert.equal(isSmtpConfigured(), true);
    assert.equal(isRealMailConfigured(), true);
  });
});

// ---- 4 & 6. resend sends expected payload + returns message id ----
test('resend: sends mapped payload and returns provider message id', async () => {
  await withEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_secret_KEY' }, async () => {
    let captured: any = null;
    await withFetch(async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200, json: async () => ({ id: 'msg_abc123' }) };
    }, async () => {
      const res = await sendConfiguredEmail(
        { from: 'Aventus <a@x.com>', to: 'b@y.com', subject: 'Proposal', text: 'Hello' },
        { quoteId: 'q1', action: 'quote.proposal.email' },
      );
      assert.equal(res.messageId, 'msg_abc123');
      assert.equal((res as any).provider, 'resend');
      assert.equal(captured.url, 'https://api.resend.com/emails');
      const body = JSON.parse(captured.init.body);
      assert.equal(body.from, 'Aventus <a@x.com>');
      assert.deepEqual(body.to, ['b@y.com']);
      assert.equal(body.subject, 'Proposal');
      assert.equal(body.text, 'Hello');
    });
  });
});

// ---- 5. resend maps PDF attachment to base64 (no raw content/logging) ----
test('resend: maps PDF attachment to base64 content', async () => {
  const pdf = Buffer.from('%PDF-1.4 hello');
  const mapped = toResendAttachments([{ filename: 'p.pdf', content: pdf, contentType: 'application/pdf' }]);
  assert.ok(mapped);
  assert.equal(mapped![0].filename, 'p.pdf');
  assert.equal(mapped![0].content, pdf.toString('base64'));
  assert.equal(mapped![0].content_type, 'application/pdf');
  // never the raw buffer
  assert.notEqual(mapped![0].content, pdf);

  await withEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x' }, async () => {
    let body: any = null;
    await withFetch(async (_url, init) => { body = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ id: 'm1' }) }; }, async () => {
      await sendConfiguredEmail(
        { from: 'a@x.com', to: 'b@y.com', subject: 'S', text: 'T', attachments: [{ filename: 'p.pdf', content: pdf, contentType: 'application/pdf' }] },
        { quoteId: 'q1' },
      );
      assert.equal(body.attachments[0].content, pdf.toString('base64'));
    });
  });
});

// ---- 7. resend failure -> safe error, no crash, no key leak ----
test('resend: failure returns safe reason and does not leak the key', async () => {
  await withEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_secret_KEY' }, async () => {
    await withFetch(async () => ({ ok: false, status: 422, json: async () => ({ name: 'validation_error', message: 'Invalid from' }) }), async () => {
      await assert.rejects(
        () => sendConfiguredEmail({ from: 'a@x.com', to: 'b@y.com', subject: 'S', text: 'T' }, { quoteId: 'q1' }),
        (err: Error) => {
          assert.ok(err.message.startsWith('resend_send_failed:'));
          assert.ok(!err.message.includes('re_secret_KEY'), 'error must not contain the API key');
          return true;
        },
      );
    });
  });
});

// ---- 8. API key never appears in the request body or returned/thrown values ----
test('resend: API key never appears in body or success result', async () => {
  await withEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_secret_KEY' }, async () => {
    await withFetch(async (_url, init) => {
      assert.ok(!String(init.body).includes('re_secret_KEY'), 'request body must not contain the key');
      assert.ok(String(init.headers.Authorization).includes('re_secret_KEY'), 'key only in Authorization header');
      return { ok: true, status: 200, json: async () => ({ id: 'm1' }) };
    }, async () => {
      const res = await sendConfiguredEmail({ from: 'a@x.com', to: 'b@y.com', subject: 'S', text: 'T' }, { quoteId: 'q1' });
      assert.ok(!JSON.stringify(res).includes('re_secret_KEY'));
    });
  });
});

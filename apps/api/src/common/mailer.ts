// Shared mailer utility for the proposal-email flow.
//
// Transport selection (in priority order):
//   1. HTTP provider — EMAIL_PROVIDER=resend + RESEND_API_KEY → Resend HTTPS API
//      (works from PaaS like Railway where outbound SMTP ports are blocked).
//   2. SMTP — SMTP_HOST set (legacy/self-hosted) → nodemailer SMTP transport.
//   3. Dry-run — neither configured → nodemailer streamTransport that BUFFERS the
//      message and delivers NOTHING (local/staging/default-safe).
//
// SECURITY: never logs RESEND_API_KEY, SMTP credentials, message bodies, or
// attachment content. Failures surface only safe reason/status/provider fields.
//
// NOTE: this module is currently consumed ONLY by the proposal-email flow
// (quotes.service). Bookings/invoices use their own separate SMTP mailers and are
// NOT affected by changes here.
import * as nodemailer from 'nodemailer';

export type EmailProvider = 'resend';

/** Resolve the active HTTP email provider, or null if none is fully configured. */
export function getEmailProvider(): EmailProvider | null {
  const provider = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (provider === 'resend') {
    // Selected but unconfigured (no key) → treat as not-configured so we fall back
    // to SMTP/dry-run rather than attempting (and failing) a real send.
    return process.env.RESEND_API_KEY ? 'resend' : null;
  }
  return null;
}

/** True only when a real SMTP host is configured. */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/**
 * True when ANY real transport (HTTP provider or SMTP) is configured. When false,
 * sending is dry-run (composed, not delivered). Callers use this to report dryRun.
 */
export function isRealMailConfigured(): boolean {
  return Boolean(getEmailProvider()) || isSmtpConfigured();
}

/**
 * Build an SMTP/stream transport: a real SMTP transport when SMTP_HOST is set,
 * otherwise a streamTransport (buffered, NON-delivering) used for dry-run.
 */
export function createMailTransport() {
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    });
  }

  // Dry-run: capture the composed message, deliver nothing.
  return nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  });
}

/** Resolve the From address for proposal email (never throws; safe fallback). */
export function resolveProposalMailFrom(): string {
  return (
    process.env.QUOTE_PROPOSAL_EMAIL_FROM ||
    process.env.SMTP_FROM ||
    'noreply@localhost'
  );
}

/**
 * Send with a bounded retry over the SMTP/stream transport. Logs only non-secret
 * context (no body, no creds). Throws the last error if all attempts fail.
 */
export async function sendMailWithRetry(
  transporter: { sendMail: (opts: Record<string, unknown>) => Promise<any> },
  mailOptions: Record<string, unknown>,
  context: Record<string, unknown>,
  retries = 1,
): Promise<{ messageId?: string | null } & Record<string, unknown>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (error) {
      lastError = error;
      const details =
        error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
      // Context is non-secret (e.g. { quoteId, action }); never log creds/body.
      console.error('Proposal email send failed', { ...context, attempt, maxAttempts: retries + 1, details });
      if (attempt <= retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  throw lastError;
}

type MailAttachment = { filename?: string; content?: unknown; contentType?: string };

/** Map our nodemailer-style attachments to Resend's { filename, content(base64) }. */
export function toResendAttachments(attachments: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(attachments) || attachments.length === 0) return undefined;
  return attachments.map((raw) => {
    const a = (raw || {}) as MailAttachment;
    const content = Buffer.isBuffer(a.content)
      ? a.content.toString('base64')
      : Buffer.from(String(a.content ?? '')).toString('base64');
    return {
      filename: a.filename || 'attachment',
      content, // base64 string — NEVER logged
      ...(a.contentType ? { content_type: a.contentType } : {}),
    };
  });
}

/**
 * Send via the Resend HTTPS API. Throws a SAFE error on failure (status + provider
 * reason only — never the API key, body, or attachment content). Returns the
 * provider message id on success.
 */
export async function sendViaResend(
  mailOptions: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<{ messageId?: string | null; provider: 'resend' } & Record<string, unknown>> {
  const apiKey = process.env.RESEND_API_KEY || '';
  const timeoutMs = Number(process.env.EMAIL_HTTP_TIMEOUT_MS || 15000);
  const to = mailOptions.to;
  const payload: Record<string, unknown> = {
    from: mailOptions.from,
    to: Array.isArray(to) ? to : [to],
    subject: mailOptions.subject,
    ...(mailOptions.text ? { text: mailOptions.text } : {}),
    ...(mailOptions.html ? { html: mailOptions.html } : {}),
  };
  const attachments = toResendAttachments(mailOptions.attachments);
  if (attachments) payload.attachments = attachments;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`, // never logged
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) {
      // Resend error bodies contain { name, message } — safe (no key). Cap length.
      const reason = (json && (json.name || json.message)) ? String(json.name || json.message) : `status_${res.status}`;
      // Safe failure log: provider + status + reason ONLY (no key, body, attachments).
      console.error('Proposal email send failed', { ...context, provider: 'resend', status: res.status, reason: reason.slice(0, 200) });
      throw new Error(`resend_send_failed:${String(reason).slice(0, 200)}`);
    }
    return { messageId: json?.id ?? null, provider: 'resend' };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('resend_send_failed:')) throw error;
    const details = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
    console.error('Proposal email send failed', { ...context, provider: 'resend', details });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send over whichever transport is configured (HTTP provider → SMTP → dry-run).
 * Returns { messageId } on success; throws a safe error on failure (caller writes
 * the failure audit). This is the single entry point the proposal-email flow uses.
 */
export async function sendConfiguredEmail(
  mailOptions: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<{ messageId?: string | null } & Record<string, unknown>> {
  if (getEmailProvider() === 'resend') {
    return sendViaResend(mailOptions, context);
  }
  // SMTP when SMTP_HOST set, else stream/dry-run — unchanged behavior.
  return sendMailWithRetry(createMailTransport(), mailOptions, context);
}

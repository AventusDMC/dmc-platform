// Shared mailer utility — modeled on the existing bookings/invoices nodemailer
// pattern (bookings.service.ts createMailTransport / sendMailWithRetry). Extracted
// here so quote proposal email (and, later, bookings/invoices) can share one
// implementation.
//
// Dry-run safety: when SMTP is NOT configured (no SMTP_HOST), createMailTransport
// returns a nodemailer streamTransport that BUFFERS the message and does not
// deliver anything. Callers treat `isSmtpConfigured() === false` as dry-run.
//
// This module never logs SMTP credentials, tokens, or message bodies.
import * as nodemailer from 'nodemailer';

/** True only when a real SMTP host is configured. Otherwise sending is dry-run. */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/**
 * Build a transport: a real SMTP transport when SMTP_HOST is set, otherwise a
 * streamTransport (buffered, NON-delivering) used for dry-run/local/staging.
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
 * Send with a bounded retry. Logs only non-secret context (no body, no creds).
 * Throws the last error if all attempts fail (caller writes a failure audit).
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

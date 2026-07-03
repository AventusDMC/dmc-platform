// Operations V2 Phase 2F-B — actual voucher-send feature flag + safety config.
// DEFAULT OFF. The backend flag is the independent kill-switch: when OFF the send
// endpoint composes/sends NOTHING and returns 'feature_disabled', regardless of
// the frontend flag. There is NO SMTP path here — Resend HTTP only.

function readBooleanEnv(name: string): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

// OFF unless OPS_V2_VOUCHER_SEND_ENABLED is explicitly truthy.
export function isOpsV2VoucherSendEnabled(): boolean {
  return readBooleanEnv('OPS_V2_VOUCHER_SEND_ENABLED');
}

// Verified Resend sender (OPS_V2_VOUCHER_EMAIL_FROM). Required when the send flag
// is ON; missing → transport_not_configured. NEVER falls back to SMTP_FROM.
export function getVoucherEmailSender(): string | null {
  const from = String(process.env.OPS_V2_VOUCHER_EMAIL_FROM ?? '').trim();
  return from || null;
}

// Parse OPS_V2_VOUCHER_SEND_RECIPIENT_ALLOWLIST into a clean, lowercased list of
// exact emails and @domains. Comma/semicolon separated. Empty when unset — the
// core fails closed (recipient_allowlist_required) while the send flag is ON.
export function parseRecipientAllowlist(raw?: string | null): string[] {
  const value = raw === undefined ? process.env.OPS_V2_VOUCHER_SEND_RECIPIENT_ALLOWLIST : raw;
  const out: string[] = [];
  for (const part of String(value ?? '').split(/[;,]/)) {
    const entry = part.trim().toLowerCase();
    if (entry && !out.includes(entry)) out.push(entry);
  }
  return out;
}

// A recipient is allowed when it matches an exact allowlisted email, OR an
// allowlisted @domain (email endsWith the "@domain" entry). Case-insensitive.
export function isRecipientAllowed(email: string, allowlist: string[]): boolean {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return false;
  return allowlist.some((entry) => (entry.startsWith('@') ? target.endsWith(entry) : target === entry));
}

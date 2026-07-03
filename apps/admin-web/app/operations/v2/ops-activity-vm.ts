/**
 * Booking Operations V2 — Activity timeline view model (pure mapping).
 *
 * ROUND 1: auditLogs-only. Dispatch events are intentionally NOT included —
 * `GET /bookings/:id` does not return them, and we add no backend work to fetch
 * them (scope decision). The ONLY input is `booking.auditLogs`.
 *
 * Data safety (allowlist + sanitize):
 *  - Maps a small allowlist of audit fields; never carries raw booking objects.
 *  - Never dumps raw JSON oldValue/newValue.
 *  - If an audit value (or its action) looks FINANCIAL or SENSITIVE — cost,
 *    sell, payable, margin, invoice, payment, bank, reference, amount-like, or a
 *    JSON blob — the change is summarized as "Value updated" instead of showing
 *    the raw value.
 *
 * Action label is a verbatim port of Classic `formatAuditAction`
 * (apps/admin-web/app/bookings/[id]/page.tsx:867-872).
 *
 * Pure module: no React, no I/O.
 */
import type { StatusVariant } from './ops-status-map';

export type RawAuditLog = {
  id: string;
  entityType?: string | null;
  entityId?: string | null;
  action?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
  actor?: string | null;
  createdAt?: string | null;
};

export type RawBookingActivity = {
  auditLogs?: RawAuditLog[] | null;
} | null
  | undefined;

export type ActivityItemVM = {
  id: string;
  actor: string;
  action: string;
  entityLabel: string | null;
  timestamp: string | null;
  timestampLabel: string;
  detail: string | null;
  changeSummary: string | null;
  severity: StatusVariant;
};

export type ActivityVM = {
  items: ActivityItemVM[];
  hasItems: boolean;
};

// Friendly, specific labels for select actions (display-only). Everything else
// falls back to the generic title-case below. Keyed by the RAW action string.
const ACTION_LABEL_OVERRIDES: Record<string, string> = {
  operational_voucher_emailed: 'Voucher emailed to supplier',
};

// --- ported action label (Classic page.tsx:867-872) ---
function formatAuditAction(action: string): string {
  const override = ACTION_LABEL_OVERRIDES[action.trim().toLowerCase()];
  if (override) return override;
  return action
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

const FINANCIAL_WORD = /\b(cost|sell|sale|payable|margin|invoice|payment|paid|bank|iban|swift|reference|amount|price|deposit|balance|total|currency|refund)\b/i;
const CURRENCY_CODE = /\b(JOD|USD|EUR|GBP|AED|SAR)\b/i;
const MONEY_SYMBOL = /[$€£]\s?\d/;
const DECIMAL_AMOUNT = /\d+[.,]\d{2}\b/;
const LONG_NUMBER = /\d{5,}/; // account/reference-like
const JSON_BLOB = /^\s*[[{]/;

// Strict internal UUID (8-4-4-4-12 hex). Used to strip internal references from
// display values while keeping human-readable names. Display-only.
const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_PARENS = new RegExp(`\\(\\s*${UUID_SOURCE}\\s*\\)`, 'gi');
const UUID_BARE = new RegExp(UUID_SOURCE, 'gi');

/** True when a string should NOT be shown verbatim (financial / sensitive / JSON). */
export function isSensitiveValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const s = String(value);
  return (
    JSON_BLOB.test(s) ||
    FINANCIAL_WORD.test(s) ||
    CURRENCY_CODE.test(s) ||
    MONEY_SYMBOL.test(s) ||
    DECIMAL_AMOUNT.test(s) ||
    LONG_NUMBER.test(s)
  );
}

function cap(value: string): string {
  const v = value.trim();
  return v.length > 80 ? `${v.slice(0, 77)}…` : v;
}

/**
 * Strip internal UUIDs from a display value, keeping human-readable text:
 * "ASSIGNED: Almushtari Logistics Services (7f12…-…)" → "ASSIGNED: Almushtari Logistics Services".
 * Returns null when nothing meaningful remains (the value was only an internal
 * reference) so callers can fall back to "Internal reference updated".
 * Display-only: never mutates stored audit data.
 */
export function humanizeAuditValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const stripped = String(value)
    .replace(UUID_PARENS, '') // "Name (uuid)" → "Name"
    .replace(UUID_BARE, '') // any bare uuid token
    .replace(/\(\s*\)/g, ' ') // leftover empty parentheses
    .replace(/\s{2,}/g, ' ') // collapse extra spaces
    .trim()
    .replace(/[:\-–—]\s*$/, '') // drop a dangling separator left by a name-only-uuid
    .trim();
  return stripped.length > 0 ? stripped : null;
}

/**
 * Safe old→new summary. Internal UUIDs are stripped (names kept); a value that
 * was ONLY an internal reference → "Internal reference updated"; financial/JSON
 * values still → "Value updated" (redaction behavior unchanged).
 */
export function changeSummary(
  action: string | null | undefined,
  oldValue: string | null | undefined,
  newValue: string | null | undefined,
): string | null {
  const rawO = (oldValue ?? '').trim();
  const rawN = (newValue ?? '').trim();
  if (!rawO && !rawN) return null;

  // Strip internal UUIDs first so human-readable names stay visible.
  const ho = rawO ? humanizeAuditValue(rawO) : '';
  const hn = rawN ? humanizeAuditValue(rawN) : '';

  // A side that had content but reduced to nothing was only an internal reference.
  if ((rawO && ho === null) || (rawN && hn === null)) {
    return 'Internal reference updated';
  }

  const o = ho ?? '';
  const n = hn ?? '';

  // Existing financial / JSON redaction (unchanged), on the sanitized values.
  if (isSensitiveValue(action) || isSensitiveValue(o) || isSensitiveValue(n)) {
    return 'Value updated';
  }

  if (o && n) return `${cap(o)} → ${cap(n)}`;
  if (n) return `Set to ${cap(n)}`;
  return `Cleared (was ${cap(o)})`;
}

/** Sanitized note/detail: strip UUIDs, redact financial, cap length. */
function humanizeDetail(note: string | null | undefined): string | null {
  if (note == null || note.trim() === '') return null;
  const h = humanizeAuditValue(note);
  if (h === null) return 'Internal reference updated'; // note was only a reference
  if (isSensitiveValue(h)) return 'Note updated';
  return cap(h);
}

/**
 * Safe recipient summary for the Phase 2F-B voucher-send audit. The audit note is
 * a JSON blob { supplierName, recipientDomains, recipientCount, messageId, attachedPdf }.
 * We surface ONLY the recipient count + email DOMAINS (e.g. "@axisdmc.com") — NEVER
 * the full address, the Resend messageId, the email body, the PDF, or any raw JSON.
 * Returns null when the note isn't the expected shape (callers fall back to the
 * generic redaction, which is also safe). Display-only; never mutates audit data.
 */
export function buildVoucherEmailedSummary(note: string | null | undefined): string | null {
  if (!note) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(note);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const count = Number(record.recipientCount);
  if (!Number.isFinite(count) || count <= 0) return null;
  // Keep only "@domain" tokens — never a full email address, and never the messageId.
  const domains = Array.isArray(record.recipientDomains)
    ? record.recipientDomains.filter((d): d is string => typeof d === 'string' && d.startsWith('@'))
    : [];
  const domainText = domains.length ? ` · ${domains.join(', ')}` : '';
  return `Emailed to ${count} recipient${count === 1 ? '' : 's'}${domainText}`;
}

function entityLabel(entityType: string | null | undefined): string | null {
  const e = String(entityType || '').toLowerCase();
  if (e === 'booking') return 'Booking';
  if (e === 'booking_service') return 'Service';
  return entityType ? formatAuditAction(String(entityType)) : null;
}

export function deriveSeverity(action: string | null | undefined): StatusVariant {
  const a = String(action || '').toLowerCase();
  if (/reject|cancel|fail|error|issue|critical|delete|remove|overdue/.test(a)) return 'critical';
  if (/confirm|complete|approve|assign|paid|sent|generated|ready/.test(a)) return 'success';
  return 'info';
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function mapItem(log: RawAuditLog): ActivityItemVM {
  const action = String(log.action || 'updated');
  // Phase 2F-B voucher-send: surface a safe recipient summary (count + domains only)
  // and suppress the raw JSON note + raw newValue — never the messageId/body/PDF.
  const emailedSummary =
    action.trim().toLowerCase() === 'operational_voucher_emailed' ? buildVoucherEmailedSummary(log.note) : null;
  return {
    id: log.id,
    actor: log.actor?.trim() || 'System',
    action: formatAuditAction(action),
    entityLabel: entityLabel(log.entityType),
    timestamp: log.createdAt ?? null,
    timestampLabel: formatTimestamp(log.createdAt),
    // `note` is operator free-text; strip UUIDs + redact financial. For the voucher-
    // send audit the safe summary carries the recipient info, so no redundant note.
    detail: emailedSummary ? null : humanizeDetail(log.note),
    changeSummary: emailedSummary ?? changeSummary(action, log.oldValue, log.newValue),
    severity: deriveSeverity(action),
  };
}

export function buildActivityVM(detail: RawBookingActivity): ActivityVM {
  const logs = Array.isArray(detail?.auditLogs) ? detail!.auditLogs! : [];
  const items = logs
    .map(mapItem)
    // newest first by timestamp (stable for equal/empty timestamps)
    .sort((a, b) => {
      const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
      const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
      return tb - ta;
    });
  return { items, hasItems: items.length > 0 };
}

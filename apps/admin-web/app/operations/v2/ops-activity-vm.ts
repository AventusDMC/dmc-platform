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

// --- ported action label (Classic page.tsx:867-872) ---
function formatAuditAction(action: string): string {
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

/** Safe old→new summary, or "Value updated" when anything looks sensitive. */
export function changeSummary(
  action: string | null | undefined,
  oldValue: string | null | undefined,
  newValue: string | null | undefined,
): string | null {
  const o = (oldValue ?? '').trim();
  const n = (newValue ?? '').trim();
  if (!o && !n) return null;
  if (isSensitiveValue(action) || isSensitiveValue(o) || isSensitiveValue(n)) {
    return 'Value updated';
  }
  if (o && n) return `${cap(o)} → ${cap(n)}`;
  if (n) return `Set to ${cap(n)}`;
  return `Cleared (was ${cap(o)})`;
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
  return {
    id: log.id,
    actor: log.actor?.trim() || 'System',
    action: formatAuditAction(action),
    entityLabel: entityLabel(log.entityType),
    timestamp: log.createdAt ?? null,
    timestampLabel: formatTimestamp(log.createdAt),
    // `note` is operator free-text; sanitize it like a value.
    detail: log.note && !isSensitiveValue(log.note) ? cap(log.note) : log.note ? 'Note updated' : null,
    changeSummary: changeSummary(action, log.oldValue, log.newValue),
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

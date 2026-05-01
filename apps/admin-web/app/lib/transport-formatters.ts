const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => (part.length <= 3 && ['fd', 'hd', 'vip'].includes(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

export function isTechnicalId(value?: string | null) {
  return UUID_PATTERN.test(String(value || '').trim());
}

export function formatSupplierName(name?: string | null, fallbackId?: string | null) {
  const normalizedName = String(name || '').trim();

  if (normalizedName && !isTechnicalId(normalizedName)) {
    return normalizedName;
  }

  const normalizedFallback = String(fallbackId || '').trim();
  return normalizedFallback && !isTechnicalId(normalizedFallback) ? normalizedFallback : 'Unknown supplier';
}

export function formatClassificationLabel(value?: string | null) {
  const normalized = String(value || 'ROUTE_TRANSFER').trim().toUpperCase();
  const labels: Record<string, string> = {
    ROUTE_TRANSFER: 'Route transfer',
    FULL_DAY: 'Full day',
    HALF_DAY: 'Half day',
    DAILY_PACKAGE: 'Daily package',
    ADD_ON: 'Add-on',
  };

  return labels[normalized] || titleCase(normalized.replaceAll('_', ' '));
}

export function formatServiceTypeLabel(value?: string | null) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return 'Transport service';
  }

  const upper = normalized.toUpperCase();
  const labels: Record<string, string> = {
    PRIVATE_TRANSFER_SERVICE: 'Private Transfer',
    TRANSPORT_ADD_ON_DAILY_CHARGE: 'Transport Add-on / Daily Charge',
    TRANSPORT_ADD_ON_DRIVER_OVERNIGHT: 'Transport Add-on / Driver Overnight',
    TRANSPORT_ADD_ON_STATIONARY_CHARGE: 'Transport Add-on / Stationary Charge',
    ROUTE_TRANSFER: 'Route transfer',
    FULL_DAY: 'Full day',
    HALF_DAY: 'Half day',
    DAILY_PACKAGE: 'Daily package',
    ADD_ON: 'Add-on',
  };

  if (labels[upper]) {
    return labels[upper];
  }

  return titleCase(
    normalized
      .replace(/^TRANSPORT_ADD_ON_/i, 'Transport add-on / ')
      .replace(/_SERVICE$/i, '')
      .replaceAll('_', ' ')
      .replace(/\s*\/\s*/g, ' / '),
  );
}

export function formatRouteLabel(value?: string | null) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return 'Route pending';
  }

  return normalized.replaceAll('_', ' ').replace(/\s*->\s*/g, ' to ').replace(/\s*→\s*/g, ' to ');
}

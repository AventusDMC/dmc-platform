// Phase O.2B-1 — PURE, read-only supplier-confirmation PREVIEW model builder.
//
// Assembles a draft "confirmation request" (recipient + subject + body + safe
// service lines) per assigned supplier, from already-loaded booking data. It is
// intentionally pure: NO IO, NO Prisma, NO Nest, NO mail transport — so it cannot
// send an email or mutate a row. It also WHITELISTS only operationally-safe fields:
// no cost / sell / payable / markup / margin / pricingDescription ever reaches the
// output (the input types don't carry them, and the output is built key-by-key).

export type SupplierConfirmationPreviewOptions = {
  supplierId?: string | null;
  serviceId?: string | null;
};

// Only operationally-safe service fields — NO cost/sell/markup/pricingDescription.
export type PreviewServiceInput = {
  id: string;
  supplierId?: string | null;
  assignedSupplierId?: string | null;
  supplierName?: string | null;
  operationType?: string | null;
  serviceType?: string | null;
  description?: string | null;
  notes?: string | null;
  confirmationNotes?: string | null;
  operationalDate?: Date | string | null;
  serviceDate?: Date | string | null;
  startTime?: string | null;
  pickupTime?: string | null;
  pickupLocation?: string | null;
  meetingPoint?: string | null;
  participantCount?: number | null;
  nights?: number | null;
  mealPlan?: string | null;
  confirmationDeadline?: Date | string | null;
};

export type PreviewSupplierLookup = { id: string; name?: string | null; email?: string | null };

export type BookingHeaderInput = {
  bookingRef?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  adults?: number | null;
  children?: number | null;
};

export type PreviewServiceLine = {
  serviceId: string;
  serviceType: string | null;
  description: string;
  serviceDate: string | null;
  timing: string | null;
  nights: number | null;
  mealPlan: string | null;
  pax: number;
  notes: string | null;
  confirmationDeadline: string | null;
};

// Phase O.2B-2B — recipient resolution source + send-readiness (read-only signal,
// NO send is wired in this phase).
export type RecipientSource = 'assignedSupplierId' | 'supplierId' | 'none';
export type ConfirmationReadiness = 'READY' | 'NO_SUPPLIER' | 'MISSING_EMAIL' | 'NO_SERVICES';

export type ConfirmationRecipient = {
  supplierId: string | null;
  supplierName: string;
  // `email` is the comma-joined recipient string (safe for a mail `to`); `emails`
  // is the parsed list. Both derived from Supplier.email (never operator input).
  email: string | null;
  emails: string[];
  missingEmail: boolean;
};

export type SupplierConfirmationDraft = {
  supplierId: string | null;
  supplierName: string;
  // O.2B-1 fields kept for back-compat (mirror recipient.email / recipient.missingEmail).
  recipientEmail: string | null;
  missingEmail: boolean;
  // O.2B-2B — resolution + readiness.
  recipientSource: RecipientSource;
  readiness: ConfirmationReadiness;
  readinessReason: string;
  recipient: ConfirmationRecipient;
  subject: string;
  body: string;
  services: PreviewServiceLine[];
};

export type SupplierConfirmationPreview = {
  bookingRef: string | null;
  travelStartDate: string | null;
  travelEndDate: string | null;
  pax: number;
  suppliers: SupplierConfirmationDraft[];
};

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// Phase O.2B-2F — parse a stored Supplier.email into a clean recipient list.
// Accepts comma- OR semicolon-separated values, trims, drops empties/dupes. Read
// only of master data — never mutates Supplier.email.
export function parseRecipientEmails(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? '').split(/[;,]/)) {
    const value = part.trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const s = clean(value);
  return s || null;
}

function dateOnly(value: Date | string | null | undefined): string | null {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function buildServiceLine(service: PreviewServiceInput, fallbackPax: number): PreviewServiceLine {
  const timing = [clean(service.pickupTime || service.startTime), clean(service.pickupLocation || service.meetingPoint)]
    .filter(Boolean)
    .join(' / ');
  const pax = Number(service.participantCount || 0) > 0 ? Number(service.participantCount) : fallbackPax;
  const notes = [clean(service.notes), clean(service.confirmationNotes)].filter(Boolean).join(' | ');
  return {
    serviceId: service.id,
    serviceType: clean(service.operationType || service.serviceType) || null,
    description: clean(service.description) || 'Service',
    serviceDate: dateOnly(service.operationalDate || service.serviceDate),
    timing: timing || null,
    nights: typeof service.nights === 'number' ? service.nights : null,
    mealPlan: clean(service.mealPlan) || null,
    pax,
    notes: notes || null,
    confirmationDeadline: dateOnly(service.confirmationDeadline),
  };
}

function buildBody(args: {
  bookingRef: string | null;
  supplierName: string;
  lines: PreviewServiceLine[];
  travelStartDate: string | null;
  travelEndDate: string | null;
}): string {
  const { bookingRef, supplierName, lines, travelStartDate, travelEndDate } = args;
  const header = [
    `Dear ${supplierName},`,
    '',
    `Please confirm availability for the following service(s) under booking ${bookingRef || '(reference pending)'}` +
      (travelStartDate ? `, travelling ${travelStartDate}${travelEndDate ? ` – ${travelEndDate}` : ''}.` : '.'),
    '',
  ];
  const body = lines.map((line, index) => {
    const parts = [
      `${index + 1}. ${line.description}`,
      line.serviceType ? `   Type: ${line.serviceType}` : null,
      line.serviceDate ? `   Date: ${line.serviceDate}` : null,
      line.timing ? `   Pickup / meeting: ${line.timing}` : null,
      typeof line.nights === 'number' ? `   Nights: ${line.nights}` : null,
      line.mealPlan ? `   Meal plan: ${line.mealPlan}` : null,
      `   Pax: ${line.pax}`,
      line.notes ? `   Notes: ${line.notes}` : null,
      line.confirmationDeadline ? `   Requested confirmation by: ${line.confirmationDeadline}` : null,
    ].filter(Boolean);
    return parts.join('\n');
  });
  const footer = ['', 'Kindly confirm or advise any pending items against each service. Thank you.'];
  return [...header, ...body, ...footer].join('\n');
}

/**
 * Build a read-only supplier-confirmation preview (one draft per assigned supplier).
 * Pure + deterministic. Optionally scope to one supplier / one service.
 */
export function buildSupplierConfirmationPreviewModel(
  booking: BookingHeaderInput,
  services: PreviewServiceInput[],
  supplierLookup: PreviewSupplierLookup[],
  options: SupplierConfirmationPreviewOptions = {},
): SupplierConfirmationPreview {
  const bookingRef = clean(booking.bookingRef) || null;
  const travelStartDate = dateOnly(booking.startDate);
  const travelEndDate = dateOnly(booking.endDate);
  const pax = Number(booking.adults || 0) + Number(booking.children || 0);

  const emailsById = new Map(supplierLookup.map((s) => [s.id, parseRecipientEmails(s.email)]));
  const nameById = new Map(supplierLookup.map((s) => [s.id, clean(s.name) || null]));

  // Phase O.2B-2F — include services linked to a supplier by ANY of assignedSupplierId
  // (operational assignment), supplierId, or supplierName. Previously assigned-only
  // services (null supplierId + null supplierName) were dropped entirely.
  let scoped = (services || []).filter((s) => s.assignedSupplierId || s.supplierId || s.supplierName);
  if (options.serviceId) scoped = scoped.filter((s) => s.id === options.serviceId);
  if (options.supplierId) {
    scoped = scoped.filter((s) => s.assignedSupplierId === options.supplierId || s.supplierId === options.supplierId);
  }

  // Group key prefers the resolvable supplier FK (assignedSupplierId ?? supplierId)
  // and falls back to supplierName only when there is NO FK at all.
  const groups: Array<{
    key: string;
    assignedSupplierId: string | null;
    supplierId: string | null;
    supplierName: string;
    services: PreviewServiceInput[];
  }> = [];
  for (const service of scoped) {
    const assigned = service.assignedSupplierId || null;
    const linked = service.supplierId || null;
    const key = assigned || linked || clean(service.supplierName) || service.id;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        assignedSupplierId: assigned,
        supplierId: linked,
        supplierName: clean(service.supplierName) || 'Unnamed supplier',
        services: [],
      };
      groups.push(group);
    } else {
      // Backfill FK fields if a later service in the same group carries them.
      group.assignedSupplierId = group.assignedSupplierId || assigned;
      group.supplierId = group.supplierId || linked;
    }
    group.services.push(service);
  }
  groups.sort((a, b) => a.supplierName.localeCompare(b.supplierName));

  const suppliers: SupplierConfirmationDraft[] = groups.map((group) => {
    const lines = group.services.map((service) => buildServiceLine(service, pax));

    // Phase O.2B-2B/-2F recipient policy: prefer the assigned supplier, else the
    // linked supplierId. NEVER resolve by supplierName string match; never accept an
    // arbitrary email. Email is parsed into a list (comma/semicolon-separated).
    const recipientSource: RecipientSource = group.assignedSupplierId ? 'assignedSupplierId' : group.supplierId ? 'supplierId' : 'none';
    const recipientSupplierId = group.assignedSupplierId || group.supplierId || null;
    const emails = recipientSupplierId ? emailsById.get(recipientSupplierId) || [] : [];
    const email = emails.length ? emails.join(', ') : null;
    const recipientSupplierName = (recipientSupplierId && nameById.get(recipientSupplierId)) || group.supplierName;

    let readiness: ConfirmationReadiness;
    let readinessReason: string;
    if (lines.length === 0) {
      readiness = 'NO_SERVICES';
      readinessReason = 'No services found for this supplier.';
    } else if (!recipientSupplierId) {
      readiness = 'NO_SUPPLIER';
      readinessReason = 'Assign a supplier first.';
    } else if (emails.length === 0) {
      readiness = 'MISSING_EMAIL';
      readinessReason = 'Supplier email missing.';
    } else {
      readiness = 'READY';
      readinessReason = recipientSource === 'assignedSupplierId' ? 'Supplier assigned and email found.' : 'Supplier linked and email found.';
    }

    const recipient: ConfirmationRecipient = {
      supplierId: recipientSupplierId,
      supplierName: recipientSupplierName,
      email,
      emails,
      missingEmail: emails.length === 0,
    };

    return {
      supplierId: recipientSupplierId,
      supplierName: group.supplierName,
      recipientEmail: email,
      missingEmail: emails.length === 0,
      recipientSource,
      readiness,
      readinessReason,
      recipient,
      subject: `Service confirmation request — ${bookingRef || 'Booking'} — ${group.supplierName}`,
      body: buildBody({ bookingRef, supplierName: group.supplierName, lines, travelStartDate, travelEndDate }),
      services: lines,
    };
  });

  return { bookingRef, travelStartDate, travelEndDate, pax, suppliers };
}

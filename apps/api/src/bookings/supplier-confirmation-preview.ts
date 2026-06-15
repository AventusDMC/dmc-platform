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
  email: string | null;
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

  const emailById = new Map(supplierLookup.map((s) => [s.id, clean(s.email) || null]));
  const nameById = new Map(supplierLookup.map((s) => [s.id, clean(s.name) || null]));

  let scoped = (services || []).filter((s) => s.supplierId || s.supplierName);
  if (options.serviceId) scoped = scoped.filter((s) => s.id === options.serviceId);
  if (options.supplierId) scoped = scoped.filter((s) => s.supplierId === options.supplierId);

  const groups: Array<{ key: string; supplierId: string | null; supplierName: string; services: PreviewServiceInput[] }> = [];
  for (const service of scoped) {
    const key = service.supplierId || service.supplierName || service.id;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, supplierId: service.supplierId || null, supplierName: clean(service.supplierName) || 'Unnamed supplier', services: [] };
      groups.push(group);
    }
    group.services.push(service);
  }
  groups.sort((a, b) => a.supplierName.localeCompare(b.supplierName));

  const suppliers: SupplierConfirmationDraft[] = groups.map((group) => {
    const lines = group.services.map((service) => buildServiceLine(service, pax));

    // Phase O.2B-2B recipient policy: prefer an explicitly assigned supplier, else
    // the linked supplierId. We NEVER resolve by supplierName string match here, and
    // never accept an arbitrary email.
    const assignedSupplierId = group.services.map((s) => (s.assignedSupplierId ? String(s.assignedSupplierId) : null)).find(Boolean) || null;
    const recipientSource: RecipientSource = assignedSupplierId ? 'assignedSupplierId' : group.supplierId ? 'supplierId' : 'none';
    const recipientSupplierId = assignedSupplierId || group.supplierId || null;
    const email = recipientSupplierId ? emailById.get(recipientSupplierId) || null : null;
    const recipientSupplierName = (recipientSupplierId && nameById.get(recipientSupplierId)) || group.supplierName;

    let readiness: ConfirmationReadiness;
    let readinessReason: string;
    if (lines.length === 0) {
      readiness = 'NO_SERVICES';
      readinessReason = 'No services found for this supplier.';
    } else if (!recipientSupplierId) {
      readiness = 'NO_SUPPLIER';
      readinessReason = 'Assign a supplier first.';
    } else if (!email) {
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
      missingEmail: !email,
    };

    return {
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      recipientEmail: email,
      missingEmail: !email,
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

/**
 * Booking Operations V2 — Documents tab view model (pure mapping).
 *
 * Reads documents ONLY from existing booking-detail data:
 *   - services[].vouchers  → voucher documents
 *   - passengers           → derived passenger-manifest readiness
 * Plus a navigation-only "Supplier confirmation preview" pointer (the Classic
 * capability exists for every booking). Guarantee/financial docs are omitted —
 * the booking detail carries no metadata for them.
 *
 * Data safety (allowlist):
 *  - Maps only id/type/status/issuedAt/supplier-name/source-service.
 *  - NEVER reads voucher snapshotJson (also not exposed) or any cost / sell /
 *    payable / margin / payment / reference / internal finance field.
 *  - Voucher notes are summarized to "Details recorded" (never raw content).
 *
 * Pure module: no React, no I/O.
 */
import { documentStatusVariant, humanizeStatus, type StatusVariant } from './ops-status-map';

export type RawVoucher = {
  id: string;
  type?: string | null;
  status?: string | null; // DRAFT | READY | SENT | ISSUED | CANCELLED
  issuedAt?: string | null;
  notes?: string | null;
  supplier?: { name?: string | null } | null;
  bookingService?: { description?: string | null; serviceType?: string | null } | null;
};

export type RawDocService = {
  description?: string | null;
  vouchers?: RawVoucher[] | null;
};

export type RawDocPassenger = {
  passportNumberMasked?: string | null;
};

export type RawBookingDocuments = {
  services?: RawDocService[] | null;
  passengers?: RawDocPassenger[] | null;
} | null
  | undefined;

export type DocumentVM = {
  id: string;
  name: string;
  sourceService: string | null;
  supplier: string | null;
  status: string;
  statusVariant: StatusVariant;
  date: string | null;
  /** "Details recorded" when internal notes exist, else null (never raw). */
  details: string | null;
};

export type DocumentGroupVM = {
  title: string;
  documents: DocumentVM[];
};

export type DocumentsVM = {
  groups: DocumentGroupVM[];
  totalCount: number;
};

const VOUCHER_TYPE_LABEL: Record<string, string> = {
  TRANSPORT: 'Transport voucher',
  EXCURSION: 'Excursion voucher',
  HOTEL: 'Hotel voucher',
  GUIDE: 'Guide voucher',
  ACTIVITY: 'Activity voucher',
  EXTERNAL_PACKAGE: 'External package voucher',
  TICKET: 'Ticket voucher',
  SERVICE: 'Service voucher',
  RESTAURANT: 'Restaurant voucher',
};

function voucherName(type: string | null | undefined): string {
  const key = String(type || '').toUpperCase();
  return VOUCHER_TYPE_LABEL[key] || `${humanizeStatus(type) || 'Service'} voucher`;
}

function mapVoucher(v: RawVoucher): DocumentVM {
  const status = String(v.status || 'DRAFT').toUpperCase();
  return {
    id: v.id,
    name: voucherName(v.type),
    sourceService: v.bookingService?.description?.trim() || null,
    supplier: v.supplier?.name?.trim() || null,
    status: humanizeStatus(status),
    statusVariant: documentStatusVariant(status),
    date: v.issuedAt ?? null,
    details: v.notes && String(v.notes).trim() ? 'Details recorded' : null,
  };
}

function buildManifestDoc(passengers: RawDocPassenger[]): DocumentVM {
  const total = passengers.length;
  const withPassport = passengers.filter((p) => p.passportNumberMasked && String(p.passportNumberMasked).trim()).length;
  let status: string;
  if (total === 0) status = 'Not generated';
  else if (withPassport === total) status = 'Available';
  else status = 'Pending';
  return {
    id: 'passenger-manifest',
    name: 'Passenger manifest',
    sourceService: total > 0 ? `${withPassport}/${total} with passport` : null,
    supplier: null,
    status,
    statusVariant: documentStatusVariant(status === 'Not generated' ? 'NOT_GENERATED' : status.toUpperCase()),
    date: null,
    details: null,
  };
}

export function buildDocumentsVM(detail: RawBookingDocuments): DocumentsVM {
  const services = Array.isArray(detail?.services) ? detail!.services! : [];
  const passengers = Array.isArray(detail?.passengers) ? detail!.passengers! : [];

  const voucherDocs: DocumentVM[] = services
    .flatMap((s) => (Array.isArray(s.vouchers) ? s.vouchers! : []))
    .map(mapVoucher);

  const groups: DocumentGroupVM[] = [
    { title: 'Vouchers', documents: voucherDocs },
    { title: 'Passenger manifest', documents: [buildManifestDoc(passengers)] },
    {
      title: 'Supplier confirmation preview',
      documents: [
        {
          id: 'supplier-confirmation-preview',
          name: 'Supplier confirmation sheet',
          sourceService: null,
          supplier: null,
          status: 'In Classic',
          statusVariant: documentStatusVariant('IN_CLASSIC'),
          date: null,
          details: null,
        },
      ],
    },
  ];

  return {
    groups,
    totalCount: voucherDocs.length,
  };
}

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../../lib/admin-server';
import { readSessionActor } from '../../../lib/auth-session';
import { AdminForbiddenState } from '../../../components/AdminForbiddenState';
import { OpsBetaHeader } from '../../../../components/ops/v2/ops-beta-header';
import { OperationalStatusBadge } from '../../../../components/ops/v2/operational-status-badge';
import { OpsBoard } from '../../../../components/ops/v2/ops-board';
import { OpsErrorCard } from '../../../../components/ops/v2/ops-error-card';
import { PaxRoomingTab } from '../../../../components/ops/v2/pax-rooming-tab';
import { ActivityTab } from '../../../../components/ops/v2/activity-tab';
import { FinanceTab } from '../../../../components/ops/v2/finance-tab';
import { DocumentsTab } from '../../../../components/ops/v2/documents-tab';
import {
  OpsWorkspaceTabs,
  OPS_TABS,
  type OpsTabId,
} from '../../../../components/ops/v2/ops-workspace-tabs';
import { isOpsV2Enabled } from '../ops-flag';
import { isOpsV2Authorized } from '../ops-access';
import { bookingStatusVariant, humanizeStatus } from '../ops-status-map';
import {
  buildOperationsBoardVM,
  type OperationsBoardVM,
  type RawBookingReadiness,
  type RawOperationsGrid,
} from '../ops-view-model';
import {
  buildPaxRoomingVM,
  type PaxRoomingVM,
  type RawBookingDetail,
} from '../ops-pax-rooming-vm';
import { buildActivityVM, type ActivityVM } from '../ops-activity-vm';
import { buildFinanceVM, type FinanceVM } from '../ops-finance-vm';
import { buildDocumentsVM, type DocumentsVM } from '../ops-documents-vm';

/**
 * Booking Operations V2 — Booking Operations Workspace (Slice 2: Operations tab).
 *
 * Read-only by construction: GET-only data, no forms, no mutations, no
 * downloads. Gated by NEXT_PUBLIC_OPS_V2_DEFAULT (default OFF → notFound).
 * Renders inside the existing app shell; "Open in Classic" deep-links to the
 * Classic per-booking operations grid. Secondary tabs are placeholders.
 */

type PageProps = {
  params: Promise<{ bookingId: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

function resolveTab(value: string | undefined): OpsTabId {
  return (OPS_TABS.find((t) => t.id === value)?.id ?? 'operations') as OpsTabId;
}

// Operations-grid is the core data; failure → error region (caller catches).
async function loadOperationsGrid(id: string): Promise<RawOperationsGrid> {
  return adminPageFetchJson<RawOperationsGrid>(`/api/bookings/${id}/operations-grid`, 'Booking operations (V2)', {
    cache: 'no-store',
  });
}

// Booking detail is SUPPLEMENTARY for the Operations tab (rooming badge + status
// pill only). It degrades to null on failure so the board still renders — the
// heavy detail call shares the 8s timeout wall, and we never blank a usable
// board for it.
async function loadBookingReadiness(id: string): Promise<RawBookingReadiness> {
  try {
    return await adminPageFetchJson<RawBookingReadiness>(`/api/bookings/${id}`, 'Booking readiness (V2)', {
      cache: 'no-store',
    });
  } catch {
    return null;
  }
}

// For the Passengers & Rooming tab, booking detail IS the tab's data — failure
// → the tab's error region (caller catches). Same GET endpoint, read-only.
async function loadBookingDetail(id: string): Promise<RawBookingDetail> {
  return adminPageFetchJson<RawBookingDetail>(`/api/bookings/${id}`, 'Booking detail (V2)', {
    cache: 'no-store',
  });
}

export default async function OperationsV2BookingWorkspacePage({ params, searchParams }: PageProps) {
  // 1) Flag gate first — when OFF the route does not exist (no role/info leak).
  if (!isOpsV2Enabled()) {
    notFound();
  }

  // 2) Role gate (flag ON only) — read the session role server-side and forbid
  // unauthorized roles BEFORE fetching any booking data. Allowed set matches the
  // Operations nav visibility (admin / operations / super_admin / agent_admin).
  const role = readSessionActor((await cookies()).get('dmc_session')?.value || '')?.role ?? null;
  if (!isOpsV2Authorized(role)) {
    return (
      <AdminForbiddenState
        title="Operations V2 access restricted"
        description="Your account does not have permission to view the Operations V2 workspace for this company."
      />
    );
  }

  const { bookingId } = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const activeTab = resolveTab(resolvedSearch?.tab);
  const classicHref = `/bookings/${bookingId}/operations`;

  // Fetch only the active tab's data; placeholder tabs stay cheap.
  let vm: OperationsBoardVM | null = null;
  let opsError = false;
  let paxVm: PaxRoomingVM | null = null;
  let paxError = false;
  let activityVm: ActivityVM | null = null;
  let activityError = false;
  let financeVm: FinanceVM | null = null;
  let financeError = false;
  let documentsVm: DocumentsVM | null = null;
  let documentsError = false;
  let bookingStatus: string | null = null;
  let bookingLabel = 'Booking';

  if (activeTab === 'operations') {
    try {
      const [grid, readiness] = await Promise.all([
        loadOperationsGrid(bookingId),
        loadBookingReadiness(bookingId),
      ]);
      vm = buildOperationsBoardVM(grid, readiness);
      bookingStatus = vm.booking.status;
      bookingLabel = vm.booking.bookingRef;
    } catch {
      opsError = true;
    }
  } else if (activeTab === 'passengers') {
    try {
      const detail = await loadBookingDetail(bookingId);
      paxVm = buildPaxRoomingVM(detail);
      bookingStatus = detail?.status ?? null;
      bookingLabel = detail?.bookingRef ?? 'Booking';
    } catch {
      paxError = true;
    }
  } else if (activeTab === 'activity') {
    try {
      const detail = await loadBookingDetail(bookingId);
      activityVm = buildActivityVM(detail);
      bookingStatus = detail?.status ?? null;
      bookingLabel = detail?.bookingRef ?? 'Booking';
    } catch {
      activityError = true;
    }
  } else if (activeTab === 'finance') {
    try {
      const detail = await loadBookingDetail(bookingId);
      financeVm = buildFinanceVM(detail);
      bookingStatus = detail?.status ?? null;
      bookingLabel = detail?.bookingRef ?? 'Booking';
    } catch {
      financeError = true;
    }
  } else if (activeTab === 'documents') {
    try {
      const detail = await loadBookingDetail(bookingId);
      documentsVm = buildDocumentsVM(detail);
      bookingStatus = detail?.status ?? null;
      bookingLabel = detail?.bookingRef ?? 'Booking';
    } catch {
      documentsError = true;
    }
  }

  const statusSlot = bookingStatus ? (
    <OperationalStatusBadge
      variant={bookingStatusVariant(bookingStatus)}
      label={humanizeStatus(bookingStatus)}
    />
  ) : null;

  return (
    <div className="bg-background">
      <OpsBetaHeader
        breadcrumb={['Operations', 'Command Center', bookingLabel]}
        title="Booking Operations"
        classicHref={classicHref}
        classicLabel="Open in Classic"
        statusSlot={statusSlot}
        innerClassName="mx-auto w-full max-w-[1200px]"
      />
      <OpsWorkspaceTabs bookingId={bookingId} active={activeTab} />

      <main className="px-4 py-6 md:px-6">
        <div className="mx-auto w-full max-w-[1200px]">
          {activeTab === 'operations' ? (
            opsError || !vm ? (
              <OpsErrorCard classicHref={classicHref} />
            ) : (
              <OpsBoard vm={vm} />
            )
          ) : null}

          {activeTab === 'passengers' ? (
            paxError || !paxVm ? (
              <OpsErrorCard classicHref={`/bookings/${bookingId}?tab=passengers`} />
            ) : (
              <PaxRoomingTab vm={paxVm} bookingId={bookingId} />
            )
          ) : null}

          {activeTab === 'finance' ? (
            financeError || !financeVm ? (
              <OpsErrorCard classicHref={`/bookings/${bookingId}?tab=financials`} />
            ) : (
              <FinanceTab vm={financeVm} bookingId={bookingId} />
            )
          ) : null}

          {activeTab === 'documents' ? (
            documentsError || !documentsVm ? (
              <OpsErrorCard classicHref={`/bookings/${bookingId}?tab=documents`} />
            ) : (
              <DocumentsTab vm={documentsVm} bookingId={bookingId} />
            )
          ) : null}

          {activeTab === 'activity' ? (
            activityError || !activityVm ? (
              <OpsErrorCard classicHref={`/bookings/${bookingId}?tab=audit-log`} />
            ) : (
              <ActivityTab vm={activityVm} bookingId={bookingId} />
            )
          ) : null}
        </div>
      </main>
    </div>
  );
}

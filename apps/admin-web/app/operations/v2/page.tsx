import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../lib/admin-server';
import { readSessionActor } from '../../lib/auth-session';
import { AdminForbiddenState } from '../../components/AdminForbiddenState';
import { OpsBetaHeader } from '../../../components/ops/v2/ops-beta-header';
import { CommandCenter } from '../../../components/ops/v2/command-center';
import { isOpsV2Enabled } from './ops-flag';
import { isOpsV2Authorized } from './ops-access';
import {
  buildCommandCenterVM,
  type RawBookingListItem,
  type RawDashboard,
  type RawDispatch,
} from './ops-command-center-vm';

/**
 * Booking Operations V2 — Command Center (Screen 1, fleet triage). Read-only.
 *
 * Binds to existing GET endpoints only (dispatch + dashboard + bookings list);
 * does NOT call per-booking operations-grid here. Each source is fetched
 * independently so one failure degrades a single region (not the page). Gated by
 * NEXT_PUBLIC_OPS_V2_DEFAULT (default OFF → notFound). Renders inside the
 * existing app shell; no second global nav.
 */

type PageProps = {
  searchParams?: Promise<{ range?: string }>;
};

const RANGES = new Set(['today', 'tomorrow', 'next-7-days']);

async function loadDispatch(range: string): Promise<RawDispatch> {
  try {
    return await adminPageFetchJson<RawDispatch>(`/api/operations/dispatch?range=${range}`, 'Operations dispatch (V2)', { cache: 'no-store' });
  } catch {
    return null;
  }
}
async function loadDashboard(): Promise<RawDashboard> {
  try {
    return await adminPageFetchJson<RawDashboard>('/api/operations/dashboard', 'Operations dashboard (V2)', { cache: 'no-store' });
  } catch {
    return null;
  }
}
async function loadBookings(): Promise<RawBookingListItem[] | null> {
  try {
    return await adminPageFetchJson<RawBookingListItem[]>('/api/bookings', 'Bookings (V2)', { cache: 'no-store' });
  } catch {
    return null;
  }
}

export default async function OperationsV2CommandCenterPage({ searchParams }: PageProps) {
  // 1) Flag gate first — when OFF the route does not exist (no role/info leak).
  if (!isOpsV2Enabled()) {
    notFound();
  }

  // 2) Role gate (flag ON only) — read the session role server-side and forbid
  // unauthorized roles BEFORE fetching any V2 data. Allowed set matches the
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

  const resolved = searchParams ? await searchParams : undefined;
  const activeRange = RANGES.has(resolved?.range ?? '') ? (resolved!.range as string) : 'today';

  // Independent fetches — each degrades to null on failure (per-region error card).
  const [dispatch, dashboard, bookings] = await Promise.all([
    loadDispatch(activeRange),
    loadDashboard(),
    loadBookings(),
  ]);

  const vm = buildCommandCenterVM({ dispatch, dashboard, bookings });

  return (
    <div className="bg-background">
      <OpsBetaHeader
        breadcrumb={['Operations', 'Command Center']}
        title="Booking Operations"
        classicHref="/operations/dispatch"
        classicLabel="Open Classic Dispatch"
        helper="Fleet triage is read-only in V2. Changes are made in Classic."
      />
      <main className="px-4 py-6 md:px-6">
        <CommandCenter vm={vm} activeRange={activeRange} />
      </main>
    </div>
  );
}

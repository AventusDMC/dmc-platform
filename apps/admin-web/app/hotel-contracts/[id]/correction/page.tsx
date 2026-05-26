import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../lib/admin-server';
import { AdminBreadcrumbs } from '../../../components/AdminBreadcrumbs';
import { CorrectionWorkspace, type CorrectionWorkspacePayload } from './CorrectionWorkspace';

export const dynamic = 'force-dynamic';

// Hotel Contract Correction Workspace v1 — focused per-contract repair
// page. Operators arrive here from:
//   - the Health Dashboard issue lists
//   - the Correction Queue rows
//   - the Validation Detail panel (the "Open in Correction Workspace"
//     link added to the dashboard component)
//
// The page hydrates from a single endpoint that composes all the
// validators + impact counts + VERIFIED gating into one round trip.

async function loadWorkspace(contractId: string): Promise<CorrectionWorkspacePayload | null> {
  try {
    return await adminPageFetchJson<CorrectionWorkspacePayload>(
      `/api/hotel-contract-health/contracts/${contractId}/correction-workspace`,
      'Hotel contract correction workspace',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotel-contract-correction] workspace unavailable', error);
    return null;
  }
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function HotelContractCorrectionPage({ params }: PageProps) {
  const { id } = await params;
  const workspace = await loadWorkspace(id);
  if (!workspace) {
    notFound();
  }

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs
          items={[
            { label: 'Hotels' },
            { label: 'Contract Health', href: '/hotel-contract-health' },
            { label: 'Correction Workspace' },
          ]}
        />
        <h1>Correction Workspace</h1>
        <p className="admin-muted-copy">
          Focused repair view for {workspace.summary.contractName} ({workspace.summary.hotelName}).
          Fix room mappings, supplement conflicts, season gaps, and pricing completeness inline —
          historical quotes and bookings are never rewritten by changes made here.
        </p>
      </div>
      <CorrectionWorkspace contractId={id} initialWorkspace={workspace} />
    </main>
  );
}

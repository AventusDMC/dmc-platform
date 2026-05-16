import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { GuidesManager } from './GuidesManager';

export const dynamic = 'force-dynamic';

async function getGuides() {
  return adminPageFetchJson<any[]>('/api/guides', 'Guides list', { cache: 'no-store' });
}

export default async function GuidesPage() {
  let guides: any[] = [];
  let loadError = false;
  try {
    guides = await getGuides();
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[guides] list unavailable', error);
    loadError = true;
  }

  const activeGuides = guides.filter((guide) => guide.active).length;
  const assignedBookings = guides.reduce((count, guide) => count + (Array.isArray(guide.bookingServices) ? guide.bookingServices.length : 0), 0);

  return (
    <main className="page">
      <section className="panel workspace-panel app-page-content">
        <WorkspaceShell
          eyebrow="Guide Operations"
          title="Guide Master"
          description="Maintain operational guide profiles, languages, regions, certifications, blocked dates, and assignment visibility."
          summary={
            <div className="quote-preview-total-list">
              <div><span>Guides</span><strong>{guides.length}</strong></div>
              <div><span>Active</span><strong>{activeGuides}</strong></div>
              <div><span>Assigned bookings</span><strong>{assignedBookings}</strong></div>
            </div>
          }
        >
          <TableSectionShell
            title="Operational guides"
            description="Guide profiles power booking guide assignment, language matching, overlap warnings, and readiness alerts."
            context={<p>{loadError ? 'Guide list unavailable' : `${guides.length} guide profiles`}</p>}
          >
            <GuidesManager initialGuides={guides} />
          </TableSectionShell>
        </WorkspaceShell>
      </section>
    </main>
  );
}

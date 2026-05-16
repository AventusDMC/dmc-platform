import { AdminForbiddenState } from '../components/AdminForbiddenState';
import { SummaryStrip } from '../components/SummaryStrip';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { adminPageFetchJson, isAdminForbiddenError } from '../lib/admin-server';
import { SeriesManager } from './SeriesManager';

async function getSeries() {
  return adminPageFetchJson<any[]>('/api/series', 'Series', {
    cache: 'no-store',
  });
}

export default async function SeriesPage() {
  try {
    const series = await getSeries();
    const departures = series.reduce((total, item) => total + (item.departures?.length || 0), 0);
    const active = series.filter((item) => item.active).length;

    return (
      <WorkspaceShell
        eyebrow="Series Operations"
        title="Series Master"
        description="Recurring group departures built from reusable operational templates."
      >
        <SummaryStrip
          items={[
            { id: 'series', label: 'Series', value: String(series.length) },
            { id: 'active', label: 'Active', value: String(active) },
            { id: 'departures', label: 'Departures', value: String(departures) },
          ]}
        />
        <SeriesManager initialSeries={series} />
      </WorkspaceShell>
    );
  } catch (error) {
    if (isAdminForbiddenError(error)) {
      return <AdminForbiddenState />;
    }
    throw error;
  }
}

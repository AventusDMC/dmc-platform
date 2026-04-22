import { AdvancedFiltersPanel } from '../components/AdvancedFiltersPanel';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { CompactFilterBar } from '../components/CompactFilterBar';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { PageActionBar } from '../components/PageActionBar';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { GalleryForm } from './GalleryForm';
import { GalleryTable } from './GalleryTable';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;

type GalleryImage = {
  id: string;
  title: string;
  imageUrl: string;
  destination: string | null;
  category: string | null;
  createdAt: string;
};

async function getGallery(): Promise<GalleryImage[]> {
  return adminPageFetchJson<GalleryImage[]>(`${API_BASE_URL}/gallery`, 'Gallery images', {
    cache: 'no-store',
  });
}

export default async function GalleryPage() {
  const images = await getGallery();
  const categorizedCount = images.filter((image) => image.category).length;
  const destinationCount = images.filter((image) => image.destination).length;

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Content"
          title="Image Library"
          description="Manage reusable imagery from a compact content workspace before attaching assets to itinerary days and sales materials."
          switcher={
            <ModuleSwitcher
              ariaLabel="Content modules"
              activeId="gallery"
              items={[{ id: 'gallery', label: 'Gallery', href: '/gallery', helper: 'Reusable image assets' }]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'images', label: 'Images', value: String(images.length), helper: 'Library entries' },
                { id: 'categorized', label: 'Categorized', value: String(categorizedCount), helper: 'Tagged assets' },
                { id: 'destinations', label: 'Destination-linked', value: String(destinationCount), helper: 'Ready for itineraries' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Content"
              title="Gallery library"
              description="Save image URLs here first, then attach them to itinerary days from a cleaner list-first asset surface."
            />

            <PageActionBar title="Content shortcuts" description="Keep asset management compact while related content guidance stays close.">
              <span className="dashboard-toolbar-link">Gallery</span>
            </PageActionBar>

            <CompactFilterBar
              eyebrow="Content Controls"
              title="Asset library controls"
              description="Keep the gallery compact by default while related usage guidance stays tucked away."
            >
              <div className="operations-filter-row">
                <span className="secondary-button">Gallery</span>
              </div>
              <AdvancedFiltersPanel title="Asset guidance" description="How this library is intended to be used">
                <div className="operations-filter-row">
                  <span className="detail-copy">Store image URLs here first, then reuse them across itinerary and preview surfaces.</span>
                </div>
              </AdvancedFiltersPanel>
            </CompactFilterBar>

            <TableSectionShell
              title="Gallery images"
              description="Manage reusable images from a compact list-first content surface."
              context={<p>{images.length} images in scope</p>}
              createPanel={
                <CollapsibleCreatePanel title="Add image" description="Save a new image URL while keeping the library visible." triggerLabelOpen="Add image">
                  <GalleryForm apiBaseUrl={API_BASE_URL} />
                </CollapsibleCreatePanel>
              }
              emptyState={<p className="empty-state">No gallery images yet.</p>}
            >
              {images.length > 0 ? <GalleryTable apiBaseUrl={API_BASE_URL} images={images} /> : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}

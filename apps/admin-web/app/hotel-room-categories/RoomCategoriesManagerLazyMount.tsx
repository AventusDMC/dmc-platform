'use client';

import dynamic from 'next/dynamic';
import type { RoomCategorySummary } from './RoomCategoriesManager';

// Lazy-mount wrapper for the heavy RoomCategoriesManager.
//
// The /hotels?tab=room-categories&load=1 page renders 57+ room
// category rows with a form, expand handlers, and per-row state. SSR'ing
// this and hydrating it on a Vercel cold-start machine has historically
// produced silent blank-page failures: the server returns 200 with the
// full HTML, but React's hydration on the client crashes without any
// console output, leaving the user staring at a white screen.
//
// `dynamic({ ssr: false })` skips server-rendering of the manager
// entirely. The page shell paints immediately, a small loading card
// fills the manager's slot, and the manager mounts client-side after
// first paint. Any hydration error is now an EXPECTED client mount
// (caught by RoomCategoriesErrorBoundary inside the manager) instead
// of a silent SSR-vs-CSR mismatch that React swallows.
//
// Trade-off: the table data is no longer in the initial HTML (slightly
// worse SEO + crawler reach). Acceptable here because this is an
// authenticated admin route — operators only, no SEO concern.

const RoomCategoriesManagerImpl = dynamic(
  () =>
    import('./RoomCategoriesManager').then((mod) => ({
      default: mod.RoomCategoriesManager,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="detail-card" role="status" aria-busy="true">
        <p className="eyebrow">Loading</p>
        <p className="detail-copy">Loading room categories…</p>
      </div>
    ),
  },
);

type HotelOption = {
  id: string;
  name: string;
  city: string;
};

type RoomCategoriesManagerLazyMountProps = {
  apiBaseUrl: string;
  hotels: HotelOption[];
  initialSummary: RoomCategorySummary[];
};

export function RoomCategoriesManagerLazyMount(props: RoomCategoriesManagerLazyMountProps) {
  return <RoomCategoriesManagerImpl {...props} />;
}

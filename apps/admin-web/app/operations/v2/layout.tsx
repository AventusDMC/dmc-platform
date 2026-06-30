// Loads the route-scoped Tailwind stylesheet for Booking Operations V2.
// Keeping the import here confines Tailwind's utilities + the supplemental
// design tokens to the /operations/v2 route only (mirrors the Quote Builder V2
// layout pattern at app/quotes/[id]/builder-v2/layout.tsx). V2 renders INSIDE
// the existing app shell — this layout adds no chrome and no second nav.
import './ops-v2.css';

export default function OperationsV2Layout({ children }: { children: React.ReactNode }) {
  return children;
}

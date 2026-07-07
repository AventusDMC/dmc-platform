// Loads the route-scoped Tailwind stylesheet for Product Catalog V2.
// Keeping the import here confines Tailwind's utilities + the supplemental design
// tokens to the /catalog/v2 route only (mirrors app/operations/v2/layout.tsx).
// The page renders INSIDE the existing app shell — this layout adds no chrome and
// no second nav.
import './catalog-v2.css';

export default function CatalogV2Layout({ children }: { children: React.ReactNode }) {
  return children;
}

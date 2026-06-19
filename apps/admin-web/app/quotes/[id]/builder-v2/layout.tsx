// Loads the route-scoped Tailwind stylesheet for the Quote Builder V2.
// Keeping the import here confines Tailwind's utilities + the supplemental
// design tokens to the /quotes/[id]/builder-v2 route only.
import "./builder-v2.css"

export default function BuilderV2Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}

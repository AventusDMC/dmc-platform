'use client';

// Phase S.1 — Unified Quote Builder entry point.
//
// The itinerary workspace exposes several separate builder tools (tailor-made
// draft, auto builder + touring-route "route block", package template, and the
// hotel/transport/experience/guide suggestion+apply sections). New operators
// lose the thread of which tool does what. This is a SINGLE front-door card
// section that organizes those EXISTING tools into one labelled workflow.
//
// UI ORGANIZATION ONLY. It mounts no engine, changes no pricing, and creates no
// QuoteItems. Each card simply reveals the existing panel that already lives in
// the workspace by opening its <details> ancestors and scrolling to its anchor
// id — the underlying panels and their apply flows are untouched.

type BuilderMethod = {
  key: string;
  title: string;
  description: string;
  // Anchor id of the existing panel this card reveals. All targets are always
  // present in the DOM (the panels themselves), so reveal never no-ops silently
  // for a missing root.
  target: string;
};

// Steps shown as plain guidance — Step 1 choose a method … Step 5 proposal.
const BUILDER_STEPS: string[] = [
  'Step 1 — Choose a starting method',
  'Step 2 — Edit the day-by-day itinerary',
  'Step 3 — Preview suggestions',
  'Step 4 — Apply services',
  'Step 5 — Generate proposal',
];

const BUILDER_METHODS: BuilderMethod[] = [
  { key: 'blank', title: 'Start from Blank', description: 'Build itinerary days manually.', target: 'qb-start-blank' },
  { key: 'tailor-made', title: 'Tailor-Made Itinerary', description: 'Generate an editable multi-day itinerary.', target: 'qb-tailor-made' },
  { key: 'route-block', title: 'Route Block', description: 'Generate a day or block from a fixed touring route.', target: 'qb-route-block' },
  { key: 'package-template', title: 'Package Template', description: 'Apply a reusable package template.', target: 'qb-package-template' },
  { key: 'guide-services', title: 'Guide Services', description: 'Build or apply guide-related quote logic.', target: 'qb-tailor-made' },
  { key: 'apply-services', title: 'Apply Services', description: 'Preview and apply hotels, transport, entrances, activities, and guides.', target: 'qb-tailor-made' },
];

// Reveal an existing panel: open every <details> ancestor (so a collapsed
// section expands) then scroll the target into view. Read-only DOM navigation.
function revealPanel(targetId: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(targetId);
  if (!el) return;
  let node: HTMLElement | null = el.closest('details');
  while (node) {
    (node as HTMLDetailsElement).open = true;
    node = node.parentElement ? node.parentElement.closest('details') : null;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function QuoteBuilderEntry() {
  return (
    <section
      className="quote-builder-entry"
      aria-label="Quote Builder"
      style={{
        background: '#f5f8f5',
        border: '1px solid #cdd7cd',
        borderRadius: 10,
        padding: '0.85rem 1rem',
        marginBottom: '0.75rem',
      }}
    >
      <div className="quote-builder-entry-head">
        <p className="eyebrow" style={{ margin: 0 }}>Quote Builder</p>
        <h3 style={{ margin: '0.15rem 0 0.25rem' }}>Itinerary Builder</h3>
        <p className="form-help" style={{ margin: 0 }}>
          Choose how to start, edit the day-by-day plan, preview suggestions, then apply services and generate the proposal.
        </p>
      </div>
      <ol
        className="quote-builder-steps"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          listStyle: 'none',
          padding: 0,
          margin: '0.65rem 0',
        }}
      >
        {BUILDER_STEPS.map((step) => (
          <li
            key={step}
            className="quote-builder-step"
            style={{ fontSize: '0.78rem', color: '#3f5340', background: '#e7efe7', borderRadius: 6, padding: '0.2rem 0.5rem' }}
          >
            {step}
          </li>
        ))}
      </ol>
      <div
        className="quote-builder-method-cards"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '0.6rem',
        }}
      >
        {BUILDER_METHODS.map((method) => (
          <button
            key={method.key}
            type="button"
            className="quote-builder-method-card"
            data-target={method.target}
            onClick={() => revealPanel(method.target)}
            style={{
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
              background: '#ffffff',
              border: '1px solid #cdd7cd',
              borderRadius: 8,
              padding: '0.6rem 0.7rem',
              cursor: 'pointer',
            }}
          >
            <strong>{method.title}</strong>
            <span className="form-help" style={{ margin: 0 }}>{method.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

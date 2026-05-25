// Workspace Guide — calm sage panel pinned to the top of every quote.
// The quote workspace has 40+ sections across 7 tabs; new operators
// (and even seasoned ones returning to a quote after a break) lose the
// thread of "what do I do, in what order?" This panel is the answer.
//
// Server-rendered, always collapsed by default. Sage palette matches
// Quote Readiness / Pricing Audit so the workspace reads as a calm
// stack of help surfaces, not a wall of competing UI.

export function QuoteWorkspaceGuide() {
  return (
    <details
      style={{
        background: '#f5f8f5',
        border: '1px solid #cdd7cd',
        borderRadius: 10,
        padding: '0.65rem 0.85rem',
        marginBottom: '0.75rem',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.75rem',
          listStyle: 'none',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            color: '#3a5a3a',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          How to use this quote
        </span>
        <strong style={{ color: '#3a5a3a', fontSize: '0.92rem' }}>
          New here? Click to see the 5-step path through the workspace
        </strong>
        <span style={{ marginLeft: 'auto', color: '#3a5a3a', fontSize: '0.78rem', fontWeight: 600 }}>
          Show ▾
        </span>
      </summary>

      <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {/* Five-step path */}
        <section>
          <h4 style={{ margin: '0 0 0.4rem', color: '#3a5a3a', fontSize: '0.95rem' }}>The 5-step path</h4>
          <ol style={{ paddingLeft: '1.2rem', margin: 0, color: '#475467', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <li>
              <strong>Setup</strong> — confirm client, dates, pax, currency. Already done if you arrived here from the Guided Builder.
            </li>
            <li>
              <strong>Build the days</strong> — open the <em>Itinerary</em> tab. Click each day card on the left to inspect it. To populate everything in one click, scroll to the <em>Auto Builder</em> and press <strong>Generate Full Itinerary</strong>.
            </li>
            <li>
              <strong>Add services per day</strong> — open the <em>Services</em> tab. Each day card has a row of buttons (Hotel, Transport, Meals, Activity, …). Click + Add to drop a flyout, pick a supplier, save.
            </li>
            <li>
              <strong>Apply pricing</strong> — open the <em>Pricing</em> tab (Step 4 in the footer). Every line item shows cost, sell, and margin. The <em>Pricing Audit</em> panel above the day cards tells you what's still missing.
            </li>
            <li>
              <strong>Send the proposal</strong> — open the <em>Proposal</em> tab. Generate PDF, copy share link, send to client.
            </li>
          </ol>
        </section>

        {/* Where to check the quote is correct */}
        <section>
          <h4 style={{ margin: '0 0 0.4rem', color: '#3a5a3a', fontSize: '0.95rem' }}>Three places to verify the quote is correct</h4>
          <ul style={{ paddingLeft: '1.2rem', margin: 0, color: '#475467', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <li>
              <strong>Pricing Audit</strong> (sage panel above day cards) — are prices entered? Currency mix? Margin floor?
            </li>
            <li>
              <strong>Quote Readiness</strong> (collapsible above day cards) — operational risk: supplier coverage, capacity, complexity.
            </li>
            <li>
              <strong>Financial Summary</strong> (right sidebar) — top-line sell, cost, profit, margin %.
            </li>
          </ul>
        </section>

        {/* Vocabulary disambiguation — the "too many models" problem */}
        <section>
          <h4 style={{ margin: '0 0 0.4rem', color: '#3a5a3a', fontSize: '0.95rem' }}>Same thing, different names</h4>
          <ul style={{ paddingLeft: '1.2rem', margin: 0, color: '#475467', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <li>
              <strong>Itinerary</strong> = <strong>Day-by-day workspace</strong> = the column of day cards on the left side of the Services tab.
            </li>
            <li>
              <strong>Day-by-day program</strong> = the saved day records (Day 01 - Arrival, Day 02 - Petra, …) inside the itinerary.
            </li>
            <li>
              <strong>Service planner</strong> = the area that opens when you click into a day card — that's where Hotel / Transport / Meal rows live.
            </li>
            <li>
              <strong>Auto Builder</strong> (top of Services tab) creates day shells + populates services. <strong>Guided Builder</strong> (Sales nav) is the entry wizard that creates a NEW quote from scratch.
            </li>
          </ul>
        </section>

        {/* When to use which Auto Builder button */}
        <section>
          <h4 style={{ margin: '0 0 0.4rem', color: '#3a5a3a', fontSize: '0.95rem' }}>Which Auto Builder button do I press?</h4>
          <ul style={{ paddingLeft: '1.2rem', margin: 0, color: '#475467', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <li>
              <strong>Generate Full Itinerary</strong> — does everything: day shells + hotels + transport + activities at 20% markup. <em>Start here 9 times out of 10.</em>
            </li>
            <li>
              <strong>Create Empty Day Shells Only</strong> — just the 8 day cards. Use when you want to add services manually from scratch.
            </li>
            <li>
              <strong>Preview Without Saving</strong> → <strong>Apply Previewed Itinerary</strong> — two-step variant if you want to see what would happen before saving.
            </li>
          </ul>
        </section>

        {/* What the tabs mean */}
        <section>
          <h4 style={{ margin: '0 0 0.4rem', color: '#3a5a3a', fontSize: '0.95rem' }}>What each tab is for</h4>
          <ul style={{ paddingLeft: '1.2rem', margin: 0, color: '#475467', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <li>
              <strong>Overview</strong> — quote setup form + at-a-glance trip summary. Edit client / dates / pax here.
            </li>
            <li>
              <strong>Itinerary</strong> — passenger manifest + rooming + day skeleton. Used for guest-data and overnight logistics.
            </li>
            <li>
              <strong>Services</strong> — the workhorse. Day-by-day builder where you actually add hotels, transport, meals, activities.
            </li>
            <li>
              <strong>Pricing</strong> (Step 4) — per-item cost / sell / markup review. Group pricing slabs (if GROUP quote).
            </li>
            <li>
              <strong>Review</strong> — pre-send checklist: blockers, warnings, cleanup items.
            </li>
            <li>
              <strong>Proposal</strong> — preview, PDF, client share link.
            </li>
            <li>
              <strong>Versions</strong> — saved snapshots history.
            </li>
          </ul>
        </section>
      </div>
    </details>
  );
}

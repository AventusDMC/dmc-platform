// Phase R.7A-1 — English client narrative preview (route/day text ONLY).
//
// A PURE, deterministic helper that turns an itinerary day's operational/route
// text (title + notes) into a polished, client-facing English paragraph for a
// READ-ONLY preview. It is the first ("route") narrative layer only:
//   • NO applied services, NO suggested services, NO network calls.
//   • NO save, NO PATCH, NO proposal-v3 change — the caller renders the text and
//     labels it "Preview only — not saved yet".
//   • Deterministic: same input → byte-identical output (no AI, no randomness).
//
// Client-safety: the only free text it ever emits comes from (a) a curated,
// hand-written place-descriptor dictionary and (b) fixed connective templates.
// Place names parsed from the title/notes are run through `sanitizePlace`, which
// strips parentheticals, money, percentages, internal codes and known
// internal/operational tokens (supplier/contract/cost/markup/vehicle class/…),
// so an operator-edited title can never leak internal data into the preview.

// Phase R.7A-2 — a minimal, client-safe descriptor of a service ALREADY applied
// to the day. The caller (workspace) maps each day's QuoteItems to this shape;
// only `kind` and (for entrance/activity) a display `name` are passed — never
// pricing, supplier, contract, vehicle class, room/meal/occupancy. The helper
// re-sanitizes `name` defensively and only ever weaves in a guide mention and
// client-safe activity callouts. hotel/transport are intentionally NOT mentioned
// (overnight city + route movement phrasing already cover them).
export type AppliedNarrativeService = {
  kind: 'guide' | 'entrance' | 'activity' | 'hotel' | 'transport';
  name?: string | null;
};

export type DayNarrativePreviewInput = {
  title: string | null | undefined;
  notes?: string | null;
  overnightCity?: string | null;
  dayNumber?: number;
  /** R.7A-2 — services already applied to this day (applied wins; no suggestions). */
  appliedServices?: AppliedNarrativeService[];
};

export type DayNarrativePreview = {
  /** The polished English preview paragraph. */
  text: string;
  /** 'route' = route/day text only; 'service-aware' = applied services woven in. */
  sourceLayer: 'route' | 'service-aware';
  /** Structural + diagnostic flags (e.g. 'arrival', 'touring', 'service-aware'). */
  flags: string[];
  /** Applied services actually mentioned (e.g. ['guide', 'activity:Wadi Rum Jeep Tour']). */
  usedServices: string[];
};

// Curated, client-safe descriptors keyed by the lowercased place name.
const PLACE_DESCRIPTORS: Record<string, string> = {
  amman: 'Jordan’s capital city',
  jerash: 'one of the best-preserved Roman cities in the region',
  madaba: 'known for its ancient mosaic map',
  'mount nebo': 'the traditional viewpoint over the Promised Land',
  petra: 'the rose-red city and one of Jordan’s most famous archaeological sites',
  'wadi rum': 'Jordan’s desert landscape known for dramatic sandstone mountains',
  'dead sea': 'the lowest point on earth',
  bethany: 'the Baptism Site on the Jordan River',
};

// Places that read with a definite article ("the Dead Sea").
const ARTICLE_THE = new Set(['dead sea']);

// Bespoke opening clause when a place is the ORIGIN of a simple two-stop
// transition day (no intermediate sightseeing). Falls back to a neutral
// "depart …" opener for places without one.
const TRANSITION_OPENER: Record<string, string> = {
  'wadi rum': 'Enjoy the desert scenery of Wadi Rum',
};

// Compass hint used only when a place is the DESTINATION of a depart-and-visit
// day (e.g. Amman → … → Petra reads "proceed south to Petra").
const DIRECTION: Record<string, string> = {
  petra: 'south',
  'wadi rum': 'south',
  aqaba: 'south',
  jerash: 'north',
  madaba: 'south',
  'mount nebo': 'west',
  'dead sea': 'west',
  bethany: 'west',
  amman: '',
};

// Tokens that must never reach client-facing text. Used to scrub parsed names.
const LEAK_WORDS =
  /\b(supplier|contract|cost|costs|sell|margin|markup|markdown|nett?|rate|rates|vehicle|coaster|hiace|sedan|minibus|minivan|van|bus|usd|jod|eur|gbp|sar|aed)\b/gi;

/** Strip anything that could leak internal/operational data from a parsed name. */
function sanitizePlace(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .replace(/\([^)]*\)/g, ' ') // (cost 500, supplier Alpha)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\bovernight\b/gi, ' ') // neutralizes "Overnight: No" residue
    .replace(LEAK_WORDS, ' ')
    .replace(/[$€£]/g, ' ')
    .replace(/\b\d[\d.,]*\s*%?\b/g, ' ') // numbers / percentages
    .replace(/\b[A-Z]{2,}[-_]?\d+[A-Z0-9-]*\b/g, ' ') // internal codes ABC123
    .replace(/[_*`~<>|:#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function key(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function descriptorFor(name: string): string {
  return PLACE_DESCRIPTORS[key(name)] || '';
}

/** "the Dead Sea" / "Petra" — applies the definite article where natural. */
function artName(name: string): string {
  if (!name) return '';
  return ARTICLE_THE.has(key(name)) ? `the ${name}` : name;
}

/** "Petra, the rose-red city …" or just "Karak" when unknown. */
function visitClause(name: string): string {
  const desc = descriptorFor(name);
  return desc ? `${artName(name)}, ${desc}` : artName(name);
}

type Segment = { name: string; wasVisit: boolean };

function parseSegments(title: string): Segment[] {
  return title
    .split('/')
    .map((raw) => {
      const wasVisit = /\bvisit\b/i.test(raw);
      const name = sanitizePlace(raw.replace(/\bvisit\b/gi, ' '));
      return { name, wasVisit };
    })
    .filter((seg) => seg.name.length > 0);
}

/** "visit A, descA, then continue to B, descB" */
function visitChain(names: string[]): string {
  return names
    .map((n, i) => `${i === 0 ? 'visit' : 'continue to'} ${visitClause(n)}`)
    .join(', then ');
}

/**
 * Phase R.7A-1/-2 — build the read-only English client narrative for one day.
 * R.7A-1: composed from route/day text only (title + notes). R.7A-2: if services
 * are already applied to the day, an applied local guide and client-safe activity
 * callouts are woven into the sightseeing sentence. Pure + deterministic.
 */
export function buildDayNarrativePreview(input: DayNarrativePreviewInput): DayNarrativePreview {
  const title = (input.title || '').trim();
  const notes = String(input.notes || '');
  const flags: string[] = [];

  // R.7A-2 — client-safe enrichment fragment from APPLIED services only.
  // Applied guide → ", with a local guide"; applied activities → ", including a
  // <name>". Entrances are no-ops (the place is already named); hotel/transport
  // are intentionally never mentioned (no name/vehicle class/supplier leak).
  const services = input.appliedServices || [];
  const guideApplied = services.some((s) => s.kind === 'guide');
  const activityNames = services
    .filter((s) => s.kind === 'activity')
    .map((s) => sanitizePlace(s.name))
    .filter((n) => n.length > 0);
  const activityClause = activityNames.length
    ? `, including ${activityNames.map((n) => `a ${n}`).join(' and ')}`
    : '';
  const guideClause = guideApplied ? ', with a local guide' : '';
  // Order: activity callout(s) then the guide mention.
  const enrich = `${activityClause}${guideClause}`;
  const usedServices: string[] = [
    ...activityNames.map((n) => `activity:${n}`),
    ...(guideApplied ? ['guide'] : []),
  ];

  // serviceUsed is true only when `enrich` is actually woven into the sentence
  // (i.e. a sightseeing branch). It drives sourceLayer + the "Includes applied
  // services" label. hotel/transport-only days stay 'route' (nothing woven).
  const finalize = (text: string, serviceUsed: boolean): DayNarrativePreview => ({
    text,
    sourceLayer: serviceUsed ? 'service-aware' : 'route',
    flags: serviceUsed ? [...flags, 'service-aware'] : flags,
    usedServices: serviceUsed ? usedServices : [],
  });

  if (!title) {
    flags.push('empty');
    return finalize('Day at leisure.', false);
  }

  // Arrival day → airport meet & assist + transfer to the overnight city.
  if (/^arrival\b/i.test(title)) {
    flags.push('arrival');
    const fromTitle = sanitizePlace(title.replace(/^arrival\b/i, ' '));
    const city = fromTitle || sanitizePlace(input.overnightCity);
    if (city && !descriptorFor(city)) flags.push('unknown-place');
    const dest = city ? artName(city) : 'your hotel';
    return finalize(`On arrival, meet and assist at the airport, then transfer to ${dest} for overnight.`, false);
  }

  // Departure day → transfer from the last city to the airport.
  if (/^departure\b/i.test(title)) {
    flags.push('departure');
    const m = notes.match(/from\s+(?:the\s+)?(.+?)\s+to\b/i);
    const origin = sanitizePlace(m ? m[1] : input.overnightCity);
    return finalize(
      origin
        ? `Transfer from ${artName(origin)} to the airport for your departure flight.`
        : 'Transfer to the airport for your departure flight.',
      false,
    );
  }

  const segments = parseSegments(title);

  // Single segment → city tour or a leisure day. (No service weaving — a guided
  // city tour already implies a guide; keep these route-only.)
  if (segments.length <= 1) {
    flags.push('leisure');
    const place = segments[0]?.name || sanitizePlace(input.overnightCity);
    if (place && !descriptorFor(place)) flags.push('unknown-place');
    if (/\btour\b/i.test(title)) {
      const tourPlace = sanitizePlace(title.replace(/\b(city|half[- ]?day|full[- ]?day|tour)\b/gi, ' ')) || place;
      const desc = descriptorFor(tourPlace);
      return finalize(
        `After breakfast, enjoy a guided city tour of ${artName(tourPlace)}${desc ? `, ${desc}` : ''}, then return to your hotel for overnight.`,
        false,
      );
    }
    return finalize(`Enjoy a day at leisure${place ? ` at ${artName(place)}` : ''} for overnight.`, false);
  }

  flags.push('touring');
  const names = segments.map((s) => s.name);
  const origin = names[0];
  const last = names[names.length - 1];
  const roundTrip = segments.length >= 3 && key(origin) === key(last);
  const visitOrigin = segments[0].wasVisit;
  const woven = enrich.length > 0;

  if (names.some((n) => !descriptorFor(n))) flags.push('unknown-place');

  // Round trip (A → … → A): visit the inner stops, then return to base.
  if (roundTrip) {
    flags.push('round-trip');
    const middles = names.slice(1, names.length - 1);
    return finalize(`After breakfast, ${visitChain(middles)}${enrich}, then return to ${artName(origin)} for overnight.`, woven);
  }

  // Visit-the-origin day ("Petra Visit / Wadi Rum"): visit origin, then continue.
  if (visitOrigin) {
    flags.push('visit-origin');
    const rest = names.slice(1);
    // The origin is the sightseeing stop (keep its descriptor); the place(s) we
    // then continue to are move-to destinations (name only — see examples).
    const continueParts = rest.map((n) => `continue to ${artName(n)}`).join(', then ');
    return finalize(`After breakfast, visit ${visitClause(origin)}${enrich}. Later, ${continueParts} for overnight.`, woven);
  }

  // Simple two-stop transition (origin → destination, no intermediate sights).
  if (names.length === 2) {
    flags.push('transition');
    const dest = last;
    const desc = descriptorFor(dest);
    const tail = desc ? `${artName(dest)}, ${desc}, for overnight.` : `${artName(dest)} for overnight.`;
    const opener = TRANSITION_OPENER[key(origin)];
    if (opener) {
      const sep = enrich ? ', before continuing to ' : ' before continuing to ';
      return finalize(`${opener}${enrich}${sep}${tail}`, woven);
    }
    // Fallback (no bespoke opener) has no clean sightseeing slot → route-only.
    return finalize(`After breakfast, depart ${artName(origin)} and continue to ${tail}`, false);
  }

  // Depart base, visit intermediate stops, proceed to the overnight destination.
  flags.push('linear');
  const middles = names.slice(1, names.length - 1);
  const dir = DIRECTION[key(last)];
  const directionPhrase = dir ? `proceed ${dir} to` : 'continue on to';
  return finalize(
    `After breakfast, depart ${artName(origin)} and ${visitChain(middles)}${enrich}. Afterwards, ${directionPhrase} ${artName(last)} for overnight.`,
    woven,
  );
}

// ---------------------------------------------------------------------------
// R.7A-3 — client-safe guard for SAVING a narrative preview into day notes.
// The preview produced by buildDayNarrativePreview is already curated client copy,
// but this is a belt-and-suspenders check before the operator persists it: refuse
// to save text that carries supplier / commercial / internal-pricing / raw-enum /
// vehicle-class leakage, or the "Overnight: No" internal marker. Word boundaries
// keep legitimate prose safe (e.g. "Pentecost" does not trip "cost").
// ---------------------------------------------------------------------------
const UNSAFE_NARRATIVE_PATTERN =
  /\b(?:supplier|contract|markup|margin|cost|sell|sedan|suv|mini\s*van|coaster|stationary)\b|capacity[_ ]unit|point[_ ]to[_ ]point|daily[_ ]full[_ ]day|airport[_ ]transfer|add[_ ]on\b|pricingdescription|overnight:\s*no/i;

/** True when the narrative text is non-empty and safe to persist to day notes. */
export function isClientSafeNarrative(text: string | null | undefined): boolean {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;
  return !UNSAFE_NARRATIVE_PATTERN.test(trimmed);
}

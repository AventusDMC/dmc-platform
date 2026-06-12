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

// ---------------------------------------------------------------------------
// Phase R.7B-1 — narrative locale scaffold. Mirrors the proposal locale set
// (en/pt/es/ar) so the planner narrative can later render in multiple languages.
// THIS PHASE ADDS NO REAL TRANSLATIONS: es/pt/ar fall back to the English
// renderer, and English output stays byte-identical. Real es/pt/ar renderers
// land in R.7B-2/-3.
// ---------------------------------------------------------------------------
export const NARRATIVE_LOCALES = ['en', 'es', 'pt', 'ar'] as const;
export type NarrativeLocale = (typeof NARRATIVE_LOCALES)[number];

/** Normalize an arbitrary value to a supported narrative locale (defaults en). */
export function resolveNarrativeLocale(value: string | null | undefined): NarrativeLocale {
  const normalized = String(value || '').trim().toLowerCase();
  return (NARRATIVE_LOCALES as readonly string[]).includes(normalized) ? (normalized as NarrativeLocale) : 'en';
}

/** Text direction for the preview container — Arabic is RTL, the rest LTR. */
export function narrativeTextDirection(locale: NarrativeLocale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

// R.7B-1 — curated, client-safe descriptors keyed by lowercased place name, now
// keyed by locale. Only `en` is populated in R.7B-1; es/pt/ar are intentionally
// empty and the English renderer reads `*.en`, so output stays byte-identical.
// R.7B-2/-3 will fill the es/pt/ar slices (consumed by their own renderers).
const PLACE_DESCRIPTORS_BY_LOCALE: Record<NarrativeLocale, Record<string, string>> = {
  en: {
    amman: 'Jordan’s capital city',
    jerash: 'one of the best-preserved Roman cities in the region',
    madaba: 'known for its ancient mosaic map',
    'mount nebo': 'the traditional viewpoint over the Promised Land',
    petra: 'the rose-red city and one of Jordan’s most famous archaeological sites',
    'wadi rum': 'Jordan’s desert landscape known for dramatic sandstone mountains',
    'dead sea': 'the lowest point on earth',
    bethany: 'the Baptism Site on the Jordan River',
  },
  // R.7B-2 — professional tourism-tone Spanish descriptors (not literal). Place
  // NAMES stay in their recognizable proper form; only the descriptor is localized.
  es: {
    amman: 'la capital de Jordania',
    jerash: 'una de las ciudades romanas mejor conservadas de la región',
    madaba: 'célebre por su antiguo mapa en mosaico',
    'mount nebo': 'el mirador tradicional sobre la Tierra Prometida',
    petra: 'la ciudad rosada y uno de los yacimientos arqueológicos más célebres de Jordania',
    'wadi rum': 'el paisaje desértico de Jordania, famoso por sus espectaculares montañas de arenisca',
    'dead sea': 'el punto más bajo de la Tierra',
    bethany: 'el lugar del Bautismo a orillas del río Jordán',
  },
  // R.7B-2 — professional tourism-tone Portuguese (pt-PT) descriptors.
  pt: {
    amman: 'a capital da Jordânia',
    jerash: 'uma das cidades romanas mais bem preservadas da região',
    madaba: 'conhecida pelo seu antigo mapa em mosaico',
    'mount nebo': 'o miradouro tradicional sobre a Terra Prometida',
    petra: 'a cidade rosada e um dos sítios arqueológicos mais famosos da Jordânia',
    'wadi rum': 'a paisagem desértica da Jordânia, conhecida pelas suas imponentes montanhas de arenito',
    'dead sea': 'o ponto mais baixo da Terra',
    bethany: 'o local do Batismo às margens do rio Jordão',
  },
  ar: {},
};

// Places that read with a definite article ("the Dead Sea"), keyed by locale.
const ARTICLE_THE_BY_LOCALE: Record<NarrativeLocale, Set<string>> = {
  en: new Set(['dead sea']),
  es: new Set(),
  pt: new Set(),
  ar: new Set(),
};

// Bespoke opening clause when a place is the ORIGIN of a simple two-stop
// transition day (no intermediate sightseeing). Falls back to a neutral
// "depart …" opener for places without one. Keyed by locale.
const TRANSITION_OPENER_BY_LOCALE: Record<NarrativeLocale, Record<string, string>> = {
  en: {
    'wadi rum': 'Enjoy the desert scenery of Wadi Rum',
  },
  es: {
    'wadi rum': 'Disfrute del paisaje desértico de Wadi Rum',
  },
  pt: {
    'wadi rum': 'Desfrute da paisagem desértica de Wadi Rum',
  },
  ar: {},
};

// Compass hint used only when a place is the DESTINATION of a depart-and-visit
// day (e.g. Amman → … → Petra reads "proceed south to Petra"). Keyed by locale.
const DIRECTION_BY_LOCALE: Record<NarrativeLocale, Record<string, string>> = {
  en: {
    petra: 'south',
    'wadi rum': 'south',
    aqaba: 'south',
    jerash: 'north',
    madaba: 'south',
    'mount nebo': 'west',
    'dead sea': 'west',
    bethany: 'west',
    amman: '',
  },
  // R.7B-2 — direction words localized; same place→compass mapping as `en`.
  es: {
    petra: 'sur',
    'wadi rum': 'sur',
    aqaba: 'sur',
    jerash: 'norte',
    madaba: 'sur',
    'mount nebo': 'oeste',
    'dead sea': 'oeste',
    bethany: 'oeste',
    amman: '',
  },
  pt: {
    petra: 'sul',
    'wadi rum': 'sul',
    aqaba: 'sul',
    jerash: 'norte',
    madaba: 'sul',
    'mount nebo': 'oeste',
    'dead sea': 'oeste',
    bethany: 'oeste',
    amman: '',
  },
  ar: {},
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

// ---------------------------------------------------------------------------
// R.7B-2 — per-locale PHRASE PACK: the connective templates + word choices that
// turn the parsed places of one day into a single client-facing paragraph. The
// place dictionaries (descriptors / articles / openers / directions) live in the
// *_BY_LOCALE maps above and are resolved per locale ALONGSIDE the pack. English
// (`en`) reproduces the R.7A wording byte-for-byte; `es`/`pt` are professional
// tourism-tone (NOT literal translation); `ar` falls back to `en` until R.7B-3.
// Place NAMES stay in their recognizable proper form across all locales — only
// descriptors + connectives are localized. Pure + deterministic; no AI.
// ---------------------------------------------------------------------------
type NarrativePhrases = {
  dayAtLeisure: string;
  yourHotel: string;
  visitWord: string;
  continueToWord: string;
  chainJoin: string;
  guideClause: string;
  activityFragment: (names: string[]) => string;
  arrival: (dest: string) => string;
  departure: (origin: string) => string;
  departureNoOrigin: string;
  cityTour: (placeClause: string) => string;
  leisure: (place: string) => string;
  roundTrip: (chain: string, enrich: string, origin: string) => string;
  visitOrigin: (originClause: string, enrich: string, continueParts: string) => string;
  transitionTail: (dest: string, desc: string) => string;
  transitionOpenerSentence: (opener: string, enrich: string, tail: string) => string;
  transitionNoOpener: (origin: string, tail: string) => string;
  linear: (origin: string, chain: string, enrich: string, directionPhrase: string, last: string) => string;
  directionPhrase: (dir: string) => string;
};

// English — reproduces R.7A wording EXACTLY (byte-identical regression guard).
const EN_PHRASES: NarrativePhrases = {
  dayAtLeisure: 'Day at leisure.',
  yourHotel: 'your hotel',
  visitWord: 'visit',
  continueToWord: 'continue to',
  chainJoin: ', then ',
  guideClause: ', with a local guide',
  activityFragment: (names) => `, including ${names.map((n) => `a ${n}`).join(' and ')}`,
  arrival: (dest) => `On arrival, meet and assist at the airport, then transfer to ${dest} for overnight.`,
  departure: (origin) => `Transfer from ${origin} to the airport for your departure flight.`,
  departureNoOrigin: 'Transfer to the airport for your departure flight.',
  cityTour: (placeClause) => `After breakfast, enjoy a guided city tour of ${placeClause}, then return to your hotel for overnight.`,
  leisure: (place) => `Enjoy a day at leisure${place ? ` at ${place}` : ''} for overnight.`,
  roundTrip: (chain, enrich, origin) => `After breakfast, ${chain}${enrich}, then return to ${origin} for overnight.`,
  visitOrigin: (originClause, enrich, continueParts) =>
    `After breakfast, visit ${originClause}${enrich}. Later, ${continueParts} for overnight.`,
  transitionTail: (dest, desc) => (desc ? `${dest}, ${desc}, for overnight.` : `${dest} for overnight.`),
  transitionOpenerSentence: (opener, enrich, tail) => {
    const sep = enrich ? ', before continuing to ' : ' before continuing to ';
    return `${opener}${enrich}${sep}${tail}`;
  },
  transitionNoOpener: (origin, tail) => `After breakfast, depart ${origin} and continue to ${tail}`,
  linear: (origin, chain, enrich, directionPhrase, last) =>
    `After breakfast, depart ${origin} and ${chain}${enrich}. Afterwards, ${directionPhrase} ${last} for overnight.`,
  directionPhrase: (dir) => (dir ? `proceed ${dir} to` : 'continue on to'),
};

// Spanish — professional tourism tone (es), deterministic.
const ES_PHRASES: NarrativePhrases = {
  dayAtLeisure: 'Día libre.',
  yourHotel: 'su hotel',
  visitWord: 'visite',
  continueToWord: 'continúe a',
  chainJoin: ', luego ',
  guideClause: ', con guía local',
  activityFragment: (names) => `, que incluye ${names.map((n) => `un ${n}`).join(' y ')}`,
  arrival: (dest) => `A su llegada, recepción y asistencia en el aeropuerto y traslado a ${dest} para pasar la noche.`,
  departure: (origin) => `Traslado desde ${origin} al aeropuerto para tomar su vuelo de salida.`,
  departureNoOrigin: 'Traslado al aeropuerto para tomar su vuelo de salida.',
  cityTour: (placeClause) => `Tras el desayuno, disfrute de una visita guiada por ${placeClause} y regrese a su hotel para pasar la noche.`,
  leisure: (place) => `Disfrute de un día libre${place ? ` en ${place}` : ''} para pasar la noche.`,
  roundTrip: (chain, enrich, origin) => `Tras el desayuno, ${chain}${enrich} y regrese a ${origin} para pasar la noche.`,
  visitOrigin: (originClause, enrich, continueParts) =>
    `Tras el desayuno, visite ${originClause}${enrich}. Más tarde, ${continueParts} para pasar la noche.`,
  transitionTail: (dest, desc) => (desc ? `${dest}, ${desc}, para pasar la noche.` : `${dest} para pasar la noche.`),
  transitionOpenerSentence: (opener, enrich, tail) => {
    const sep = enrich ? ', antes de continuar a ' : ' antes de continuar a ';
    return `${opener}${enrich}${sep}${tail}`;
  },
  transitionNoOpener: (origin, tail) => `Tras el desayuno, salga de ${origin} y continúe a ${tail}`,
  linear: (origin, chain, enrich, directionPhrase, last) =>
    `Tras el desayuno, salga de ${origin} y ${chain}${enrich}. A continuación, ${directionPhrase} ${last} para pasar la noche.`,
  directionPhrase: (dir) => (dir ? `diríjase hacia el ${dir} a` : 'continúe hacia'),
};

// Portuguese (pt-PT) — professional tourism tone, deterministic.
const PT_PHRASES: NarrativePhrases = {
  dayAtLeisure: 'Dia livre.',
  yourHotel: 'o seu hotel',
  visitWord: 'visite',
  continueToWord: 'siga para',
  chainJoin: ', em seguida ',
  guideClause: ', com guia local',
  activityFragment: (names) => `, incluindo ${names.map((n) => `um ${n}`).join(' e ')}`,
  arrival: (dest) => `À chegada, receção e assistência no aeroporto e transporte para ${dest} para pernoitar.`,
  departure: (origin) => `Transporte de ${origin} para o aeroporto para o seu voo de partida.`,
  departureNoOrigin: 'Transporte para o aeroporto para o seu voo de partida.',
  cityTour: (placeClause) => `Após o pequeno-almoço, desfrute de uma visita guiada por ${placeClause} e regresse ao seu hotel para pernoitar.`,
  leisure: (place) => `Desfrute de um dia livre${place ? ` em ${place}` : ''} para pernoitar.`,
  roundTrip: (chain, enrich, origin) => `Após o pequeno-almoço, ${chain}${enrich} e regresse a ${origin} para pernoitar.`,
  visitOrigin: (originClause, enrich, continueParts) =>
    `Após o pequeno-almoço, visite ${originClause}${enrich}. Mais tarde, ${continueParts} para pernoitar.`,
  transitionTail: (dest, desc) => (desc ? `${dest}, ${desc}, para pernoitar.` : `${dest} para pernoitar.`),
  transitionOpenerSentence: (opener, enrich, tail) => {
    const sep = enrich ? ', antes de seguir para ' : ' antes de seguir para ';
    return `${opener}${enrich}${sep}${tail}`;
  },
  transitionNoOpener: (origin, tail) => `Após o pequeno-almoço, parta de ${origin} e siga para ${tail}`,
  linear: (origin, chain, enrich, directionPhrase, last) =>
    `Após o pequeno-almoço, parta de ${origin} e ${chain}${enrich}. Em seguida, ${directionPhrase} ${last} para pernoitar.`,
  directionPhrase: (dir) => (dir ? `siga para ${dir} até` : 'continue até'),
};

// Real renderers exist for en/es/pt; ar maps to en (R.7B-3 adds Arabic).
const NARRATIVE_PHRASES: Record<'en' | 'es' | 'pt', NarrativePhrases> = {
  en: EN_PHRASES,
  es: ES_PHRASES,
  pt: PT_PHRASES,
};

/**
 * Phase R.7A/R.7B — the deterministic client-narrative renderer for one day, in a
 * given locale. R.7A-1: composed from route/day text only (title + notes). R.7A-2:
 * applied guide/activity services woven into the sightseeing sentence. R.7B-2:
 * locale-parameterized — the structural logic + flags are locale-INVARIANT; only
 * the phrase pack (connectives) + place dictionaries (descriptors/articles/
 * openers/directions) vary by locale. English output is byte-identical to R.7A.
 */
function renderNarrative(
  input: DayNarrativePreviewInput,
  locale: 'en' | 'es' | 'pt',
): DayNarrativePreview {
  const P = NARRATIVE_PHRASES[locale];
  const descriptors = PLACE_DESCRIPTORS_BY_LOCALE[locale];
  const articleThe = ARTICLE_THE_BY_LOCALE[locale];
  const openers = TRANSITION_OPENER_BY_LOCALE[locale];
  const directions = DIRECTION_BY_LOCALE[locale];

  const descriptorFor = (name: string): string => descriptors[key(name)] || '';
  const artName = (name: string): string => {
    if (!name) return '';
    return articleThe.has(key(name)) ? `the ${name}` : name;
  };
  const visitClause = (name: string): string => {
    const desc = descriptorFor(name);
    return desc ? `${artName(name)}, ${desc}` : artName(name);
  };
  const visitChain = (chainNames: string[]): string =>
    chainNames.map((n, i) => `${i === 0 ? P.visitWord : P.continueToWord} ${visitClause(n)}`).join(P.chainJoin);

  const title = (input.title || '').trim();
  const notes = String(input.notes || '');
  const flags: string[] = [];

  // R.7A-2 — client-safe enrichment fragment from APPLIED services only.
  // Applied guide → guide clause; applied activities → activity callout(s).
  // Entrances are no-ops (the place is already named); hotel/transport are
  // intentionally never mentioned (no name/vehicle class/supplier leak).
  const services = input.appliedServices || [];
  const guideApplied = services.some((s) => s.kind === 'guide');
  const activityNames = services
    .filter((s) => s.kind === 'activity')
    .map((s) => sanitizePlace(s.name))
    .filter((n) => n.length > 0);
  const activityClause = activityNames.length ? P.activityFragment(activityNames) : '';
  const guideClause = guideApplied ? P.guideClause : '';
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
    return finalize(P.dayAtLeisure, false);
  }

  // Arrival day → airport meet & assist + transfer to the overnight city.
  if (/^arrival\b/i.test(title)) {
    flags.push('arrival');
    const fromTitle = sanitizePlace(title.replace(/^arrival\b/i, ' '));
    const city = fromTitle || sanitizePlace(input.overnightCity);
    if (city && !descriptorFor(city)) flags.push('unknown-place');
    const dest = city ? artName(city) : P.yourHotel;
    return finalize(P.arrival(dest), false);
  }

  // Departure day → transfer from the last city to the airport.
  if (/^departure\b/i.test(title)) {
    flags.push('departure');
    const m = notes.match(/from\s+(?:the\s+)?(.+?)\s+to\b/i);
    const origin = sanitizePlace(m ? m[1] : input.overnightCity);
    return finalize(origin ? P.departure(artName(origin)) : P.departureNoOrigin, false);
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
      const placeClause = `${artName(tourPlace)}${desc ? `, ${desc}` : ''}`;
      return finalize(P.cityTour(placeClause), false);
    }
    return finalize(P.leisure(place ? artName(place) : ''), false);
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
    return finalize(P.roundTrip(visitChain(middles), enrich, artName(origin)), woven);
  }

  // Visit-the-origin day ("Petra Visit / Wadi Rum"): visit origin, then continue.
  if (visitOrigin) {
    flags.push('visit-origin');
    const rest = names.slice(1);
    // The origin is the sightseeing stop (keep its descriptor); the place(s) we
    // then continue to are move-to destinations (name only — see examples).
    const continueParts = rest.map((n) => `${P.continueToWord} ${artName(n)}`).join(P.chainJoin);
    return finalize(P.visitOrigin(visitClause(origin), enrich, continueParts), woven);
  }

  // Simple two-stop transition (origin → destination, no intermediate sights).
  if (names.length === 2) {
    flags.push('transition');
    const dest = last;
    const desc = descriptorFor(dest);
    const tail = P.transitionTail(artName(dest), desc);
    const opener = openers[key(origin)];
    if (opener) {
      return finalize(P.transitionOpenerSentence(opener, enrich, tail), woven);
    }
    // Fallback (no bespoke opener) has no clean sightseeing slot → route-only.
    return finalize(P.transitionNoOpener(artName(origin), tail), false);
  }

  // Depart base, visit intermediate stops, proceed to the overnight destination.
  flags.push('linear');
  const middles = names.slice(1, names.length - 1);
  const directionPhrase = P.directionPhrase(directions[key(last)] || '');
  return finalize(P.linear(artName(origin), visitChain(middles), enrich, directionPhrase, artName(last)), woven);
}

/** Back-compat alias: the English renderer is `renderNarrative(input, 'en')`. */
function renderNarrativeEn(input: DayNarrativePreviewInput): DayNarrativePreview {
  return renderNarrative(input, 'en');
}

// R.7B-2 — per-locale renderer map. en/es/pt are real deterministic renderers;
// `ar` still falls back to the English renderer (Arabic + RTL UI land in R.7B-3).
const NARRATIVE_RENDERERS: Record<NarrativeLocale, (input: DayNarrativePreviewInput) => DayNarrativePreview> = {
  en: (input) => renderNarrative(input, 'en'),
  es: (input) => renderNarrative(input, 'es'),
  pt: (input) => renderNarrative(input, 'pt'),
  ar: (input) => renderNarrative(input, 'en'),
};

/**
 * Phase R.7A — build the read-only client narrative preview for one day.
 * R.7B-1: accepts an optional locale (en/es/pt/ar, default en). English output is
 * byte-identical to R.7A; es/pt/ar fall back to the English renderer until their
 * own renderers land (R.7B-2/-3). Pure + deterministic; no AI, no network.
 */
export function buildDayNarrativePreview(
  input: DayNarrativePreviewInput,
  options?: { locale?: NarrativeLocale },
): DayNarrativePreview {
  const locale = resolveNarrativeLocale(options?.locale);
  return (NARRATIVE_RENDERERS[locale] || renderNarrativeEn)(input);
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

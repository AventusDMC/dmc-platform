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
  // R.7B-3A — Modern Standard Arabic descriptors (professional proposal tone).
  ar: {
    amman: 'عاصمة الأردن',
    jerash: 'إحدى أفضل المدن الرومانية حفظاً في المنطقة',
    madaba: 'المشهورة بخريطتها الفسيفسائية القديمة',
    'mount nebo': 'المطلّ التقليدي على الأرض الموعودة',
    petra: 'المدينة الوردية وإحدى أشهر المواقع الأثرية في الأردن',
    'wadi rum': 'صحراء الأردن المعروفة بجبالها الرملية المهيبة',
    'dead sea': 'أخفض نقطة على وجه الأرض',
    bethany: 'موقع المعمودية على نهر الأردن',
  },
};

// R.7B-2 — locale-specific DISPLAY NAMES for the obvious translatable places.
// Only the names that have an established Spanish/Portuguese form are localized;
// everything else (Amman, Jerash, Madaba, Petra, Wadi Rum, …) keeps its source
// proper form. Keyed by lowercased source name. `en` is empty (uses the source).
const PLACE_NAME_BY_LOCALE: Record<NarrativeLocale, Record<string, string>> = {
  en: {},
  es: { 'mount nebo': 'Monte Nebo', 'dead sea': 'Mar Muerto', bethany: 'Betania' },
  pt: { 'mount nebo': 'Monte Nebo', 'dead sea': 'Mar Morto', bethany: 'Betânia' },
  // R.7B-3A — Arabic display names. The Arabic forms carry their own definite
  // article (ال) where natural, so no separate article word is needed (see below).
  ar: {
    amman: 'عمّان',
    jerash: 'جرش',
    madaba: 'مادبا',
    'mount nebo': 'جبل نيبو',
    petra: 'البتراء',
    'wadi rum': 'وادي رم',
    'dead sea': 'البحر الميت',
    bethany: 'المغطس',
  },
};

// The DEFINITE ARTICLE a place reads with, per locale ('' = none). English uses
// "the" ("the Dead Sea"); Spanish/Portuguese use the masculine "el"/"o" for the
// places that require it, which the renderer then contracts with prepositions
// (a+el→al, de+el→del; a+o→ao, de+o→do, em+o→no, por+o→pelo). Keyed by source name.
const PLACE_ARTICLE_BY_LOCALE: Record<NarrativeLocale, Record<string, string>> = {
  en: { 'dead sea': 'the' },
  es: { 'mount nebo': 'el', 'dead sea': 'el' },
  pt: { 'mount nebo': 'o', 'dead sea': 'o' },
  ar: {},
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
  ar: {
    'wadi rum': 'استمتعوا بالمناظر الصحراوية في وادي رم',
  },
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
  // R.7B-3A — Arabic compass adverbs (منصوب): جنوباً / شمالاً / غرباً.
  ar: {
    petra: 'جنوباً',
    'wadi rum': 'جنوباً',
    aqaba: 'جنوباً',
    jerash: 'شمالاً',
    madaba: 'جنوباً',
    'mount nebo': 'غرباً',
    'dead sea': 'غرباً',
    bethany: 'غرباً',
    amman: '',
  },
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
// (`en`) reproduces the R.7A wording byte-for-byte; `es`/`pt`/`ar` are professional
// tourism-tone (NOT literal translation). Latin-script names stay proper-form; the
// Arabic pack uses localized names + Arabic punctuation. Pure + deterministic; no AI.
// ---------------------------------------------------------------------------
type LocalePlace = { disp: string; art: string; desc: string };
type NarrativePhrases = {
  dayAtLeisure: string;
  chainJoin: string;
  guideClause: string;
  activityFragment: (names: string[]) => string;
  arrival: (dest: LocalePlace | null) => string; // null → "your hotel"
  departure: (origin: LocalePlace | null) => string;
  cityTour: (place: LocalePlace) => string;
  leisure: (place: LocalePlace | null) => string;
  /** One chain element ("visit X, desc" / "continue to X, desc"). */
  chainItem: (place: LocalePlace, isFirst: boolean) => string;
  /** Visit-origin "continue to X" element (name only, no descriptor). */
  continueItem: (place: LocalePlace) => string;
  roundTrip: (chain: string, enrich: string, origin: LocalePlace) => string;
  visitOrigin: (origin: LocalePlace, enrich: string, continueParts: string) => string;
  transitionOpener: (opener: string, enrich: string, dest: LocalePlace) => string;
  transitionNoOpener: (origin: LocalePlace, dest: LocalePlace) => string;
  linear: (origin: LocalePlace, chain: string, enrich: string, dir: string, last: LocalePlace) => string;
};

// Shared, locale-INVARIANT surface helpers. The article word is supplied per
// locale (en "the", es "el", pt "o", '' = none), so these compose the same way
// everywhere; only the preposition CONTRACTIONS below differ by locale.
const bareName = (p: LocalePlace): string => (p.art ? `${p.art} ${p.disp}` : p.disp);
const withDesc = (p: LocalePlace): string => (p.desc ? `${bareName(p)}, ${p.desc}` : bareName(p));

// Spanish preposition + article contractions (a+el→al, de+el→del; desde/en/por/hacia keep "el").
const esA = (p: LocalePlace): string => (p.art ? `al ${p.disp}` : `a ${p.disp}`);
const esDe = (p: LocalePlace): string => (p.art ? `del ${p.disp}` : `de ${p.disp}`);
const esDesde = (p: LocalePlace): string => (p.art ? `desde ${p.art} ${p.disp}` : `desde ${p.disp}`);
const esEn = (p: LocalePlace): string => (p.art ? `en ${p.art} ${p.disp}` : `en ${p.disp}`);
const esPor = (p: LocalePlace): string => (p.art ? `por ${p.art} ${p.disp}` : `por ${p.disp}`);
const esHacia = (p: LocalePlace): string => (p.art ? `hacia ${p.art} ${p.disp}` : `hacia ${p.disp}`);

// Portuguese preposition + article contractions (a+o→ao, de+o→do, em+o→no, por+o→pelo; para/até keep "o").
const ptA = (p: LocalePlace): string => (p.art ? `ao ${p.disp}` : `a ${p.disp}`);
const ptPara = (p: LocalePlace): string => (p.art ? `para ${p.art} ${p.disp}` : `para ${p.disp}`);
const ptDe = (p: LocalePlace): string => (p.art ? `do ${p.disp}` : `de ${p.disp}`);
const ptEm = (p: LocalePlace): string => (p.art ? `no ${p.disp}` : `em ${p.disp}`);
const ptPor = (p: LocalePlace): string => (p.art ? `pelo ${p.disp}` : `por ${p.disp}`);
const ptAte = (p: LocalePlace): string => (p.art ? `até ${p.art} ${p.disp}` : `até ${p.disp}`);

const enTail = (dest: LocalePlace): string =>
  dest.desc ? `${bareName(dest)}, ${dest.desc}, for overnight.` : `${bareName(dest)} for overnight.`;
const esTail = (destPhrase: string, dest: LocalePlace): string =>
  dest.desc ? `${destPhrase}, ${dest.desc}, para pasar la noche.` : `${destPhrase} para pasar la noche.`;
const ptTail = (destPhrase: string, dest: LocalePlace): string =>
  dest.desc ? `${destPhrase}, ${dest.desc}, para pernoitar.` : `${destPhrase} para pernoitar.`;

// R.7B-3A — Arabic surface helpers. Arabic place names are self-contained (the
// definite article ال is part of the display name) and the prepositions إلى/من
// attach directly, so there is NO contraction to do. Descriptor clauses + tails
// use the Arabic comma (،) for clean RTL proposal flow.
const arWithDesc = (p: LocalePlace): string => (p.desc ? `${p.disp}، ${p.desc}` : p.disp);
const arTail = (dest: LocalePlace): string =>
  dest.desc ? `${dest.disp}، ${dest.desc}، للمبيت.` : `${dest.disp} للمبيت.`;

// Known activity-name translations (MSA). Unknown activity names fall back to the
// (already sanitized) source name — never invent an unsafe translation.
const AR_ACTIVITY_NAMES: Record<string, string> = {
  'wadi rum jeep tour': 'جولة بسيارات الدفع الرباعي في وادي رم',
};
const arActivity = (name: string): string => AR_ACTIVITY_NAMES[key(name)] || name;

// English — reproduces R.7A wording EXACTLY (byte-identical regression guard).
const EN_PHRASES: NarrativePhrases = {
  dayAtLeisure: 'Day at leisure.',
  chainJoin: ', then ',
  guideClause: ', with a local guide',
  activityFragment: (names) => `, including ${names.map((n) => `a ${n}`).join(' and ')}`,
  arrival: (dest) => `On arrival, meet and assist at the airport, then transfer to ${dest ? bareName(dest) : 'your hotel'} for overnight.`,
  departure: (origin) =>
    origin
      ? `Transfer from ${bareName(origin)} to the airport for your departure flight.`
      : 'Transfer to the airport for your departure flight.',
  cityTour: (place) => `After breakfast, enjoy a guided city tour of ${withDesc(place)}, then return to your hotel for overnight.`,
  leisure: (place) => `Enjoy a day at leisure${place ? ` at ${bareName(place)}` : ''} for overnight.`,
  chainItem: (place, isFirst) => `${isFirst ? 'visit' : 'continue to'} ${withDesc(place)}`,
  continueItem: (place) => `continue to ${bareName(place)}`,
  roundTrip: (chain, enrich, origin) => `After breakfast, ${chain}${enrich}, then return to ${bareName(origin)} for overnight.`,
  visitOrigin: (origin, enrich, continueParts) =>
    `After breakfast, visit ${withDesc(origin)}${enrich}. Later, ${continueParts} for overnight.`,
  transitionOpener: (opener, enrich, dest) => {
    const sep = enrich ? ', before continuing to ' : ' before continuing to ';
    return `${opener}${enrich}${sep}${enTail(dest)}`;
  },
  transitionNoOpener: (origin, dest) => `After breakfast, depart ${bareName(origin)} and continue to ${enTail(dest)}`,
  linear: (origin, chain, enrich, dir, last) => {
    const directionPhrase = dir ? `proceed ${dir} to` : 'continue on to';
    return `After breakfast, depart ${bareName(origin)} and ${chain}${enrich}. Afterwards, ${directionPhrase} ${bareName(last)} for overnight.`;
  },
};

// Spanish — professional tourism tone (es), deterministic, grammatical prepositions.
const ES_PHRASES: NarrativePhrases = {
  dayAtLeisure: 'Día libre.',
  chainJoin: ', luego ',
  guideClause: ', con guía local',
  activityFragment: (names) => `, que incluye ${names.map((n) => `un ${n}`).join(' y ')}`,
  arrival: (dest) =>
    `A su llegada, recepción y asistencia en el aeropuerto y traslado ${dest ? esA(dest) : 'a su hotel'} para pasar la noche.`,
  departure: (origin) =>
    origin
      ? `Traslado ${esDesde(origin)} al aeropuerto para tomar su vuelo de salida.`
      : 'Traslado al aeropuerto para tomar su vuelo de salida.',
  cityTour: (place) =>
    `Tras el desayuno, disfrute de una visita guiada ${esPor(place)}${place.desc ? `, ${place.desc}` : ''} y regrese a su hotel para pasar la noche.`,
  leisure: (place) => `Disfrute de un día libre${place ? ` ${esEn(place)}` : ''} para pasar la noche.`,
  chainItem: (place, isFirst) =>
    isFirst ? `visite ${withDesc(place)}` : `continúe ${esA(place)}${place.desc ? `, ${place.desc}` : ''}`,
  continueItem: (place) => `continúe ${esA(place)}`,
  roundTrip: (chain, enrich, origin) => `Tras el desayuno, ${chain}${enrich} y regrese ${esA(origin)} para pasar la noche.`,
  visitOrigin: (origin, enrich, continueParts) =>
    `Tras el desayuno, visite ${withDesc(origin)}${enrich}. Más tarde, ${continueParts} para pasar la noche.`,
  transitionOpener: (opener, enrich, dest) => {
    const sep = enrich ? ', antes de continuar ' : ' antes de continuar ';
    return `${opener}${enrich}${sep}${esTail(esA(dest), dest)}`;
  },
  transitionNoOpener: (origin, dest) => `Tras el desayuno, salga ${esDe(origin)} y continúe ${esTail(esA(dest), dest)}`,
  linear: (origin, chain, enrich, dir, last) => {
    const directionPhrase = dir ? `diríjase hacia el ${dir} ${esA(last)}` : `continúe ${esHacia(last)}`;
    return `Tras el desayuno, salga ${esDe(origin)} y ${chain}${enrich}. A continuación, ${directionPhrase} para pasar la noche.`;
  },
};

// Portuguese (pt-PT) — professional tourism tone, deterministic, grammatical prepositions.
const PT_PHRASES: NarrativePhrases = {
  dayAtLeisure: 'Dia livre.',
  chainJoin: ', em seguida ',
  guideClause: ', com guia local',
  activityFragment: (names) => `, incluindo ${names.map((n) => `um ${n}`).join(' e ')}`,
  arrival: (dest) =>
    `À chegada, receção e assistência no aeroporto e transporte ${dest ? ptPara(dest) : 'para o seu hotel'} para pernoitar.`,
  departure: (origin) =>
    origin
      ? `Transporte ${ptDe(origin)} para o aeroporto para o seu voo de partida.`
      : 'Transporte para o aeroporto para o seu voo de partida.',
  cityTour: (place) =>
    `Após o pequeno-almoço, desfrute de uma visita guiada ${ptPor(place)}${place.desc ? `, ${place.desc}` : ''} e regresse ao seu hotel para pernoitar.`,
  leisure: (place) => `Desfrute de um dia livre${place ? ` ${ptEm(place)}` : ''} para pernoitar.`,
  chainItem: (place, isFirst) =>
    isFirst ? `visite ${withDesc(place)}` : `siga ${ptPara(place)}${place.desc ? `, ${place.desc}` : ''}`,
  continueItem: (place) => `siga ${ptPara(place)}`,
  roundTrip: (chain, enrich, origin) => `Após o pequeno-almoço, ${chain}${enrich} e regresse ${ptA(origin)} para pernoitar.`,
  visitOrigin: (origin, enrich, continueParts) =>
    `Após o pequeno-almoço, visite ${withDesc(origin)}${enrich}. Mais tarde, ${continueParts} para pernoitar.`,
  transitionOpener: (opener, enrich, dest) => {
    const sep = enrich ? ', antes de seguir ' : ' antes de seguir ';
    return `${opener}${enrich}${sep}${ptTail(ptPara(dest), dest)}`;
  },
  transitionNoOpener: (origin, dest) => `Após o pequeno-almoço, parta ${ptDe(origin)} e siga ${ptTail(ptPara(dest), dest)}`,
  linear: (origin, chain, enrich, dir, last) => {
    const directionPhrase = dir ? `siga para ${dir} ${ptAte(last)}` : `continue ${ptAte(last)}`;
    return `Após o pequeno-almoço, parta ${ptDe(origin)} e ${chain}${enrich}. Em seguida, ${directionPhrase} para pernoitar.`;
  },
};

// Arabic (MSA) — professional travel-proposal tone, RTL-safe, Arabic punctuation.
// Place names are self-contained (carry their own ال); إلى/من attach directly, so
// no contraction. The "و" conjunction in `linear` attaches to the chain (وزيارة …).
const AR_PHRASES: NarrativePhrases = {
  dayAtLeisure: 'يوم حر.',
  chainJoin: '، ثم ',
  guideClause: '، مع مرشد محلي',
  activityFragment: (names) => `، بما في ذلك ${names.map((n) => arActivity(n)).join(' و')}`,
  arrival: (dest) =>
    `عند الوصول، الاستقبال والمساعدة في المطار، ثم النقل إلى ${dest ? dest.disp : 'فندقكم'} للمبيت.`,
  departure: (origin) =>
    origin ? `النقل من ${origin.disp} إلى المطار لرحلة المغادرة.` : 'النقل إلى المطار لرحلة المغادرة.',
  cityTour: (place) =>
    `بعد الإفطار، استمتعوا بجولة برفقة مرشد في ${arWithDesc(place)}، ثم العودة إلى الفندق للمبيت.`,
  leisure: (place) => `استمتعوا بيوم حر${place ? ` في ${place.disp}` : ''} للمبيت.`,
  chainItem: (place, isFirst) => (isFirst ? `زيارة ${arWithDesc(place)}` : `المتابعة إلى ${arWithDesc(place)}`),
  continueItem: (place) => `المتابعة إلى ${place.disp}`,
  roundTrip: (chain, enrich, origin) => `بعد الإفطار، ${chain}${enrich}، ثم العودة إلى ${origin.disp} للمبيت.`,
  visitOrigin: (origin, enrich, continueParts) =>
    `بعد الإفطار، زيارة ${arWithDesc(origin)}${enrich}. بعد ذلك، ${continueParts} للمبيت.`,
  transitionOpener: (opener, enrich, dest) => {
    const sep = enrich ? '، قبل المتابعة إلى ' : ' قبل المتابعة إلى ';
    return `${opener}${enrich}${sep}${arTail(dest)}`;
  },
  transitionNoOpener: (origin, dest) => `بعد الإفطار، المغادرة من ${origin.disp} والمتابعة إلى ${arTail(dest)}`,
  linear: (origin, chain, enrich, dir, last) => {
    const directionPhrase = dir ? `التوجه ${dir} إلى ${last.disp}` : `المتابعة إلى ${last.disp}`;
    return `بعد الإفطار، المغادرة من ${origin.disp} و${chain}${enrich}. بعد ذلك، ${directionPhrase} للمبيت.`;
  },
};

// R.7B-3A — real deterministic renderers now exist for all four locales (en/es/pt/ar).
const NARRATIVE_PHRASES: Record<NarrativeLocale, NarrativePhrases> = {
  en: EN_PHRASES,
  es: ES_PHRASES,
  pt: PT_PHRASES,
  ar: AR_PHRASES,
};

/**
 * Phase R.7A/R.7B — the deterministic client-narrative renderer for one day, in a
 * given locale. R.7A-1: composed from route/day text only (title + notes). R.7A-2:
 * applied guide/activity services woven into the sightseeing sentence. R.7B-2:
 * locale-parameterized — the structural logic + flags are locale-INVARIANT; only
 * the phrase pack (connectives), localized place NAMES, articles, descriptors,
 * openers + directions vary by locale. English output is byte-identical to R.7A.
 */
function renderNarrative(
  input: DayNarrativePreviewInput,
  locale: NarrativeLocale,
): DayNarrativePreview {
  const P = NARRATIVE_PHRASES[locale];
  const descriptors = PLACE_DESCRIPTORS_BY_LOCALE[locale];
  const localNames = PLACE_NAME_BY_LOCALE[locale];
  const articleWords = PLACE_ARTICLE_BY_LOCALE[locale];
  const openers = TRANSITION_OPENER_BY_LOCALE[locale];
  const directions = DIRECTION_BY_LOCALE[locale];

  const descriptorFor = (name: string): string => descriptors[key(name)] || '';
  // Resolve a parsed place name into its localized surface form: localized
  // display name (or source), definite article word, and localized descriptor.
  const placeOf = (name: string): LocalePlace => ({
    disp: localNames[key(name)] || name,
    art: articleWords[key(name)] || '',
    desc: descriptorFor(name),
  });
  const buildChain = (chainNames: string[]): string =>
    chainNames.map((n, i) => P.chainItem(placeOf(n), i === 0)).join(P.chainJoin);

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
    return finalize(P.arrival(city ? placeOf(city) : null), false);
  }

  // Departure day → transfer from the last city to the airport.
  if (/^departure\b/i.test(title)) {
    flags.push('departure');
    const m = notes.match(/from\s+(?:the\s+)?(.+?)\s+to\b/i);
    const origin = sanitizePlace(m ? m[1] : input.overnightCity);
    return finalize(P.departure(origin ? placeOf(origin) : null), false);
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
      return finalize(P.cityTour(placeOf(tourPlace)), false);
    }
    return finalize(P.leisure(place ? placeOf(place) : null), false);
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
    return finalize(P.roundTrip(buildChain(middles), enrich, placeOf(origin)), woven);
  }

  // Visit-the-origin day ("Petra Visit / Wadi Rum"): visit origin, then continue.
  if (visitOrigin) {
    flags.push('visit-origin');
    const rest = names.slice(1);
    // The origin is the sightseeing stop (keep its descriptor); the place(s) we
    // then continue to are move-to destinations (name only — see examples).
    const continueParts = rest.map((n) => P.continueItem(placeOf(n))).join(P.chainJoin);
    return finalize(P.visitOrigin(placeOf(origin), enrich, continueParts), woven);
  }

  // Simple two-stop transition (origin → destination, no intermediate sights).
  if (names.length === 2) {
    flags.push('transition');
    const opener = openers[key(origin)];
    if (opener) {
      return finalize(P.transitionOpener(opener, enrich, placeOf(last)), woven);
    }
    // Fallback (no bespoke opener) has no clean sightseeing slot → route-only.
    return finalize(P.transitionNoOpener(placeOf(origin), placeOf(last)), false);
  }

  // Depart base, visit intermediate stops, proceed to the overnight destination.
  flags.push('linear');
  const middles = names.slice(1, names.length - 1);
  return finalize(P.linear(placeOf(origin), buildChain(middles), enrich, directions[key(last)] || '', placeOf(last)), woven);
}

/** Back-compat alias: the English renderer is `renderNarrative(input, 'en')`. */
function renderNarrativeEn(input: DayNarrativePreviewInput): DayNarrativePreview {
  return renderNarrative(input, 'en');
}

// R.7B-3A — per-locale renderer map. All four locales (en/es/pt/ar) are now real
// deterministic renderers; nothing falls back to English. (R.7B-3B wires the UI.)
const NARRATIVE_RENDERERS: Record<NarrativeLocale, (input: DayNarrativePreviewInput) => DayNarrativePreview> = {
  en: (input) => renderNarrative(input, 'en'),
  es: (input) => renderNarrative(input, 'es'),
  pt: (input) => renderNarrative(input, 'pt'),
  ar: (input) => renderNarrative(input, 'ar'),
};

/**
 * Phase R.7A — build the read-only client narrative preview for one day.
 * R.7B-1/-2/-3A: accepts an optional locale (en/es/pt/ar, default en). All four
 * locales are now real deterministic renderers (no English fallback); English
 * output stays byte-identical to R.7A. Pure + deterministic; no AI, no network.
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

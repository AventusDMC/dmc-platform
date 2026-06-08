// Phase R.4b-1 — static Day Route / Day-Plan preset catalog.
//
// A code-level, read-only catalog of common Jordan day plans. Selecting a preset
// only PREFILLS the existing day title + narrative editor (R.1d-fix); the
// operator still clicks "Save title & narrative" to persist via the existing
// PATCH /itinerary/day/:id. No schema, no DB model, no QuoteItems, no pricing,
// no service apply. Preset metadata (entrance/activity/transport hints) is here
// for future use; nothing is persisted as a preset key yet.
//
// IMPORTANT: the left day-navigation rail already prefixes "Day NN - ", so
// defaultTitle is the ROUTE title only (e.g. "Amman / Madaba / Mount Nebo /
// Petra"), never "Day 03 — …".

export type DayRouteTransportHint = 'ARRIVAL_TRANSFER' | 'DEPARTURE_TRANSFER' | 'TOURING_FULL_DAY' | 'NONE';

export interface DayRoutePreset {
  /** Stable key (also the future i18n narrativeTemplateKey). */
  key: string;
  /** Operator-facing dropdown label. */
  label: string;
  /** Route title to prefill (NO "Day NN —" prefix — the rail adds that). */
  defaultTitle: string;
  /** Overnight city, or null for a departure day. */
  overnightCity: string | null;
  origin: string | null;
  destination: string | null;
  /** Intermediate sightseeing stops. */
  stops: string[];
  transportHint: DayRouteTransportHint;
  /** Suggested entrance/ticket place keys (planning metadata only). */
  entranceKeys: string[];
  /** Suggested activity keys (planning metadata only). */
  activityKeys: string[];
  /** Guide hint, or null. */
  guideHint: string | null;
  /** Future per-locale template key; EN narrative is supplied below for now. */
  narrativeTemplateKey: string;
  /** EN narrative to prefill into the day notes. */
  narrative: string;
}

export const DAY_ROUTE_PRESETS: DayRoutePreset[] = [
  {
    key: 'qaia-amman',
    label: 'QAIA → Amman',
    defaultTitle: 'Arrival Amman',
    overnightCity: 'Amman',
    origin: 'QAIA',
    destination: 'Amman',
    stops: [],
    transportHint: 'ARRIVAL_TRANSFER',
    entranceKeys: [],
    activityKeys: [],
    guideHint: null,
    narrativeTemplateKey: 'qaia-amman',
    narrative: 'Meet & assist at Queen Alia International Airport (QAIA) and transfer to your hotel in Amman. Overnight in Amman.',
  },
  {
    key: 'amman-city-tour',
    label: 'Amman City Tour',
    defaultTitle: 'Amman City Tour',
    overnightCity: 'Amman',
    origin: 'Amman',
    destination: 'Amman',
    stops: [],
    transportHint: 'TOURING_FULL_DAY',
    entranceKeys: ['amman-citadel', 'roman-theatre'],
    activityKeys: [],
    guideHint: 'Local guide for Amman',
    narrativeTemplateKey: 'amman-city-tour',
    narrative: "Explore the highlights of Amman, including the Citadel and the Roman Theatre. Overnight in Amman.",
  },
  {
    key: 'amman-jerash-amman',
    label: 'Amman → Jerash → Amman',
    defaultTitle: 'Amman / Jerash / Amman',
    overnightCity: 'Amman',
    origin: 'Amman',
    destination: 'Amman',
    stops: ['Jerash'],
    transportHint: 'TOURING_FULL_DAY',
    entranceKeys: ['jerash'],
    activityKeys: [],
    guideHint: 'Local guide for Jerash',
    narrativeTemplateKey: 'amman-jerash-amman',
    narrative: 'Day trip north to the Greco-Roman city of Jerash, one of the best-preserved provincial Roman towns, then return to Amman. Overnight in Amman.',
  },
  {
    key: 'amman-madaba-nebo-petra',
    label: 'Amman → Madaba → Mount Nebo → Petra',
    defaultTitle: 'Amman / Madaba / Mount Nebo / Petra',
    overnightCity: 'Petra',
    origin: 'Amman',
    destination: 'Petra',
    stops: ['Madaba', 'Mount Nebo'],
    transportHint: 'TOURING_FULL_DAY',
    entranceKeys: ['madaba', 'mount-nebo'],
    activityKeys: [],
    guideHint: 'Local guide for Madaba / Mount Nebo',
    narrativeTemplateKey: 'amman-madaba-nebo-petra',
    narrative: 'Travel south from Amman, visiting the mosaics of Madaba and the viewpoint at Mount Nebo, then continue to Petra. Overnight in Petra.',
  },
  {
    key: 'petra-wadi-rum',
    label: 'Petra Visit → Wadi Rum',
    defaultTitle: 'Petra Visit / Wadi Rum',
    overnightCity: 'Wadi Rum',
    origin: 'Petra',
    destination: 'Wadi Rum',
    stops: [],
    transportHint: 'TOURING_FULL_DAY',
    entranceKeys: ['petra'],
    activityKeys: [],
    guideHint: 'Local guide for Petra',
    narrativeTemplateKey: 'petra-wadi-rum',
    narrative: 'Spend the morning exploring the rose-red city of Petra, then continue to the desert landscapes of Wadi Rum. Overnight in Wadi Rum.',
  },
  {
    key: 'wadi-rum-dead-sea',
    label: 'Wadi Rum → Dead Sea',
    defaultTitle: 'Wadi Rum / Dead Sea',
    overnightCity: 'Dead Sea',
    origin: 'Wadi Rum',
    destination: 'Dead Sea',
    stops: [],
    transportHint: 'TOURING_FULL_DAY',
    entranceKeys: [],
    activityKeys: ['wadi-rum-jeep'],
    guideHint: null,
    narrativeTemplateKey: 'wadi-rum-dead-sea',
    narrative: 'Enjoy a jeep tour through the dunes and rock formations of Wadi Rum, then transfer to the Dead Sea. Overnight at the Dead Sea.',
  },
  {
    key: 'dead-sea-free-day',
    label: 'Dead Sea Free Day',
    defaultTitle: 'Dead Sea',
    overnightCity: 'Dead Sea',
    origin: 'Dead Sea',
    destination: 'Dead Sea',
    stops: [],
    transportHint: 'NONE',
    entranceKeys: [],
    activityKeys: [],
    guideHint: null,
    narrativeTemplateKey: 'dead-sea-free-day',
    narrative: 'A free day to relax and float in the mineral-rich waters of the Dead Sea, the lowest point on Earth. Overnight at the Dead Sea.',
  },
  {
    key: 'dead-sea-bethany-dead-sea',
    label: 'Dead Sea → Bethany → Dead Sea',
    defaultTitle: 'Bethany / Dead Sea',
    overnightCity: 'Dead Sea',
    origin: 'Dead Sea',
    destination: 'Dead Sea',
    stops: ['Bethany'],
    transportHint: 'TOURING_FULL_DAY',
    entranceKeys: ['bethany'],
    activityKeys: [],
    guideHint: 'Local guide for Bethany',
    narrativeTemplateKey: 'dead-sea-bethany-dead-sea',
    narrative: 'Visit Bethany Beyond the Jordan, the baptism site of Jesus, then return to the Dead Sea. Overnight at the Dead Sea.',
  },
  {
    key: 'dead-sea-qaia',
    label: 'Dead Sea → QAIA',
    defaultTitle: 'Departure',
    overnightCity: null,
    origin: 'Dead Sea',
    destination: 'QAIA',
    stops: [],
    transportHint: 'DEPARTURE_TRANSFER',
    entranceKeys: [],
    activityKeys: [],
    guideHint: null,
    narrativeTemplateKey: 'dead-sea-qaia',
    narrative: 'Transfer from the Dead Sea to Queen Alia International Airport (QAIA) for your departure flight.',
  },
];

/** Sentinel for the default "Custom" (free-text) option — no preset applied. */
export const CUSTOM_DAY_PRESET_KEY = 'custom';

export function getDayRoutePreset(key: string | null | undefined): DayRoutePreset | null {
  if (!key || key === CUSTOM_DAY_PRESET_KEY) {
    return null;
  }
  return DAY_ROUTE_PRESETS.find((preset) => preset.key === key) || null;
}

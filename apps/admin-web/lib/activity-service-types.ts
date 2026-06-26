// Frontend mirror of the backend ACTIVITY_SERVICE_TYPE_CODES
// (apps/api/src/common/service-taxonomy.ts). The V2 activity pricing apply UI
// must recognize the same activity service-type codes the backend classifies as
// activities — not just the literal "ACTIVITY" — so real items (e.g. JEEP_TOUR)
// get the activity apply control. KEEP IN SYNC with the backend list.
export const ACTIVITY_SERVICE_TYPE_CODES = [
  "ACTIVITY",
  "JEEP_TOUR",
  "BOAT_RIDE",
  "PETRA_BY_NIGHT",
  "OPTIONAL_EXCURSION",
  "SOUND_LIGHT_SHOW",
  "SAFARI",
  "CRUISE",
  "EXCURSION",
] as const

const ACTIVITY_SERVICE_TYPE_CODE_SET = new Set<string>(ACTIVITY_SERVICE_TYPE_CODES)

/**
 * True when a service-type code is one the backend classifies as an activity
 * (mirrors backend isActivityService code matching). Case/space-insensitive.
 * Meal (MEAL), guide (GUIDE), hotel (HOTEL), transport and external-package
 * codes are intentionally NOT in the set, so they stay out of activity scope.
 */
export function isActivityServiceTypeCode(code: string | null | undefined): boolean {
  return ACTIVITY_SERVICE_TYPE_CODE_SET.has(String(code ?? "").trim().toUpperCase())
}

// V2 pricing-apply kind classification — the single source of truth for deciding
// whether a quote item is Entrance / Meal / Activity / Guide.
//
// Kept in its own leaf module (no Next/server imports) so it is unit-testable in
// isolation and shared by the ERP→UI adapter.
import { isActivityServiceTypeCode } from "./activity-service-types"

/** The minimal item shape the classifier reads (structurally a subset of the adapter's ApiQuoteItem). */
export interface ApplyKindItem {
  entranceFeeId?: string | null
  service?: { serviceType?: { code?: string | null } | null } | null
}

export interface ApplyKind {
  isEntrance: boolean
  isMeal: boolean
  isActivity: boolean
  isGuide: boolean
}

/**
 * Decide the V2 pricing-apply kind for a quote item.
 *
 * `entranceFeeId` is the DOMINANT signal: an item linked to an EntranceFee is
 * ALWAYS Entrance / Jordan Pass and NEVER Meal / Activity / Guide — even when its
 * service-type code or name looks like an activity (e.g. a "Baptism Site Entrance
 * Fee" carried on an activity-typed service, or an entrance whose serviceType.code
 * is in ACTIVITY_SERVICE_TYPE_CODES). This prevents an entrance row from getting
 * the Activity apply control (wrong pricing kind / wrong Jordan-Pass behaviour).
 *
 * Items WITHOUT entranceFeeId fall back to service-type codes, so real activities
 * (JEEP_TOUR, EXCURSION, …) stay Activity and meals/guides keep their own kind.
 * The four flags are mutually exclusive. Hotels, transport and external packages
 * match none of them and stay out of apply scope (read-only / Classic).
 */
export function classifyItemApplyKind(it: ApplyKindItem): ApplyKind {
  const isEntrance = Boolean(it.entranceFeeId)
  return {
    isEntrance,
    isMeal: !isEntrance && it.service?.serviceType?.code === "MEAL",
    isActivity: !isEntrance && isActivityServiceTypeCode(it.service?.serviceType?.code),
    isGuide: !isEntrance && it.service?.serviceType?.code === "GUIDE",
  }
}

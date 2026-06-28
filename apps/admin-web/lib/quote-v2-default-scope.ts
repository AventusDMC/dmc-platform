// Pure, dependency-free resolver for whether Quote Builder V2 is the DEFAULT
// landing for a given quote/user — a blanket global default OR a scoped (by quote
// status and/or user role) rollout.
//
// DEFAULT OFF: with no configuration this returns false, so /quotes/[id] keeps
// serving Classic exactly as today. Env reading happens in the caller
// (app/quotes/[id]/quote-readiness.ts); this module stays pure so the rollout
// logic is unit-testable without touching process.env.
//
// This decides ROUTING only. It never changes pricing, readiness/send logic, or
// what is editable inside V2 — the V2 route enforces its own role/flag/status
// gates regardless of how the user arrived.

export interface V2DefaultScopeConfig {
  /** NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT === 'true' — blanket default for everyone. */
  globalDefault: boolean
  /** Upper-cased backend statuses that opt into V2 by default (empty = no status gate). */
  statuses: ReadonlySet<string>
  /** Lower-cased roles that opt into V2 by default (empty = no role gate). */
  roles: ReadonlySet<string>
}

export interface V2DefaultScopeInput {
  /** Raw backend status code, e.g. "SENT" / "ACCEPTED" (quote.meta.statusCode). */
  statusCode?: string | null
  /** Normalised session role, e.g. "admin" / "operations". */
  role?: string | null
}

/** Parse a comma-separated env value into a normalised Set (trimmed, cased, no blanks). */
export function parseScopeCsv(value: string | null | undefined, casing: "upper" | "lower"): Set<string> {
  if (!value) return new Set()
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => (casing === "upper" ? entry.toUpperCase() : entry.toLowerCase())),
  )
}

/** True when the scoped mechanism is configured at all (any status and/or role list). */
export function isV2ScopedConfigPresent(cfg: Pick<V2DefaultScopeConfig, "statuses" | "roles">): boolean {
  return cfg.statuses.size > 0 || cfg.roles.size > 0
}

/**
 * Resolve whether V2 is the default landing for one quote/user.
 * - global default ON → always true (unchanged blanket behaviour).
 * - else scoped: at least one of statuses/roles must be configured, and every
 *   configured gate must match (status in list AND role in list). An unconfigured
 *   gate is treated as "any".
 * - nothing configured → false (Classic remains the default).
 */
export function resolveV2DefaultForQuote(cfg: V2DefaultScopeConfig, input: V2DefaultScopeInput): boolean {
  if (cfg.globalDefault) return true
  if (!isV2ScopedConfigPresent(cfg)) return false
  const statusOk =
    cfg.statuses.size === 0 || (input.statusCode != null && cfg.statuses.has(input.statusCode.toUpperCase()))
  const roleOk = cfg.roles.size === 0 || (input.role != null && cfg.roles.has(input.role.toLowerCase()))
  return statusOk && roleOk
}

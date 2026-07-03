"use client"

import { useState } from "react"
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, PackageCheck } from "lucide-react"
import { Button } from "../../ui/button"

// Booking Creation V2 — Slice 1D: the Quote Builder V2 "Create Booking" trigger.
//
// Renders ONLY when `canCreateBooking` is true, which the server computes as
// NEXT_PUBLIC_QUOTE_BOOKING_CREATE (default OFF) + admin/operations role +
// convertible status (ACCEPTED/CONFIRMED). The backend route POST /quotes/:id/v2/booking
// remains the source of truth: it re-checks the flag, role, status, accepted version,
// and duplicate protection, and returns typed errors this card surfaces. Conversion is
// idempotent — a second attempt returns the existing booking (alreadyExisted).

type BookingResult = {
  bookingId?: string | null
  bookingRef?: string | null
  opsV2Url?: string | null
  alreadyExisted?: boolean
}

// Typed backend error codes → friendly, actionable copy.
function friendlyError(code: string | undefined, fallback: string | undefined): string {
  switch (code) {
    case "feature_disabled":
      return "Booking creation isn’t enabled in this environment yet."
    case "quote_not_convertible":
      return "This quote can’t be converted yet — it must be Accepted or Confirmed first."
    case "missing_accepted_version":
      return "This quote has no accepted version to convert. Accept the quote first."
    case "booking_exists":
      return "A booking already exists for this quote."
    case "conversion_failed":
      return "Booking creation failed. Please try again, or use the Classic builder."
    default:
      return fallback?.slice(0, 300) || "Booking creation failed. Please try again."
  }
}

export interface CreateBookingCardProps {
  quoteId: string
  /** Server-gated: flag ON + admin/operations role + convertible status. */
  canCreateBooking?: boolean
}

export function CreateBookingCard({ quoteId, canCreateBooking = false }: CreateBookingCardProps) {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<BookingResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!canCreateBooking) {
    return null
  }

  const handleCreate = async () => {
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/quotes/${quoteId}/v2/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const body = await res.json().catch(() => ({} as Record<string, unknown>))
      if (res.ok) {
        setResult({
          bookingId: (body as BookingResult).bookingId ?? null,
          bookingRef: (body as BookingResult).bookingRef ?? null,
          opsV2Url: (body as BookingResult).opsV2Url ?? null,
          alreadyExisted: Boolean((body as BookingResult).alreadyExisted),
        })
      } else {
        const code = (body as { code?: string }).code
        const message = (body as { message?: string }).message
        setError(friendlyError(code, typeof message === "string" ? message : undefined))
      }
    } catch {
      setError("Couldn’t reach the server. Please try again.")
    } finally {
      setPending(false)
    }
  }

  // Success / already-exists result view.
  if (result) {
    const existed = Boolean(result.alreadyExisted)
    const href = result.opsV2Url || (result.bookingId ? `/operations/v2/${result.bookingId}` : null)
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          <h3 className="font-heading text-sm font-semibold text-foreground">
            {existed ? "Booking already exists" : "Booking created"}
          </h3>
        </div>
        {result.bookingRef ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Reference <span className="font-medium text-foreground">{result.bookingRef}</span>
          </p>
        ) : null}
        {href ? (
          <a
            href={href}
            className="mt-3 inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {existed ? "Open booking" : "Open in Operations V2"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    )
  }

  // Idle / loading / error view.
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <PackageCheck className="size-4 text-primary" aria-hidden="true" />
        <h3 className="font-heading text-sm font-semibold text-foreground">Create booking</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Convert this confirmed quote into an operational booking. Pricing and services are
        snapshotted; the booking opens in Operations V2.
      </p>
      <Button size="sm" className="mt-3 w-full gap-2" onClick={handleCreate} disabled={pending} aria-disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ExternalLink className="size-4" aria-hidden="true" />
        )}
        {pending ? "Creating…" : "Create booking"}
      </Button>
      {error ? (
        <p className="mt-2 text-pretty text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

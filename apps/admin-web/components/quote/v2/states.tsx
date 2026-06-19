"use client"

import type { ReactNode } from "react"
import { FileQuestion, TriangleAlert, RefreshCw } from "lucide-react"
import { Button } from "../../ui/button"
import { Card } from "../../ui/card"
import { cn } from "../../../lib/utils"

/** Full-screen frame shared by loading / empty / error states. */
function CenteredFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      {children}
    </div>
  )
}

function Shimmer({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />
}

/** Skeleton shown while a quote is being fetched. */
export function QuoteBuilderLoading() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden w-64 shrink-0 bg-sidebar lg:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 items-center justify-between border-b border-border px-6">
          <Shimmer className="h-5 w-48" />
          <div className="flex gap-2">
            <Shimmer className="h-8 w-24" />
            <Shimmer className="h-8 w-28" />
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
          <Shimmer className="h-28 w-full" />
          <Shimmer className="h-16 w-full" />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-3">
              <Shimmer className="h-8 w-1/3" />
              <Shimmer className="h-32 w-full" />
              <Shimmer className="h-32 w-full" />
              <Shimmer className="h-32 w-full" />
            </div>
            <div className="space-y-4">
              <Shimmer className="h-40 w-full" />
              <Shimmer className="h-32 w-full" />
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only" role="status">
        Loading quote…
      </span>
    </div>
  )
}

/** Shown when no quote could be found / loaded. */
export function QuoteBuilderEmpty({
  title = "No quote found",
  description = "We couldn't find a quote to load here. Pick a quote from the list or create a new one to get started.",
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <CenteredFrame>
      <Card className="flex max-w-md flex-col items-center p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileQuestion className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-heading text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </Card>
    </CenteredFrame>
  )
}

/** Shown when loading the quote failed. */
export function QuoteBuilderError({
  message = "Something went wrong while loading this quote.",
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <CenteredFrame>
      <Card className="flex max-w-md flex-col items-center p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-heading text-lg font-semibold text-foreground">
          Unable to load quote
        </h2>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">{message}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" className="mt-5 gap-2" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
        ) : null}
      </Card>
    </CenteredFrame>
  )
}

/** Inline empty state used inside an individual step panel. */
export function StepEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof FileQuestion
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
      <p className="max-w-sm text-pretty text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
  )
}

import type { ReactNode } from "react"

export function StepHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="text-pretty text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  )
}

import * as React from "react"
import { cn } from "@/lib/utils"

interface LoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  text?: string
}

const Loader = React.forwardRef<HTMLDivElement, LoaderProps>(
  ({ className, text = "Working...", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "animate-text-shimmer bg-clip-text text-transparent",
          "bg-[linear-gradient(110deg,hsl(var(--muted-foreground)),45%,hsl(var(--foreground)),55%,hsl(var(--muted-foreground)))]",
          "bg-[length:250%_100%]",
          className
        )}
        {...props}
      >
        {text}
      </div>
    )
  }
)

Loader.displayName = "Loader"

export { Loader }
export type { LoaderProps }

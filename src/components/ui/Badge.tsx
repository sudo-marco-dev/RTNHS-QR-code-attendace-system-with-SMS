import * as React from "react"
import { cn } from "../../lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "present" | "late" | "absent"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-forest focus:ring-offset-2",
        {
          "bg-forest text-tea": variant === "default",
          "bg-tea-light text-forest border-none": variant === "present",
          "bg-[#fff3e0] text-[#b35c00] border-none": variant === "late",
          "bg-[#fdecea] text-[#8b1a1a] border-none": variant === "absent",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }

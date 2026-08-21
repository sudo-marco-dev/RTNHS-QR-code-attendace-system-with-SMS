import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95",
          {
            "bg-[#04471c] text-[#c3d898] hover:bg-[#0a5c24] border-transparent": variant === "default",
            "bg-[#70161e] text-[#f5c0c3] hover:bg-[#8b1a1a] border-transparent": variant === "destructive",
            "bg-transparent border-[var(--sidebar-border)] text-[var(--body-text)] hover:bg-[var(--row-alt)]": variant === "outline",
            "bg-transparent border border-[#7ea16b] text-[#04471c] dark:text-[#c3d898] hover:bg-[var(--row-alt)]": variant === "secondary",
            "bg-transparent text-[var(--body-text)] hover:bg-[var(--row-alt)] border-transparent": variant === "ghost",
            "text-[#04471c] underline-offset-4 hover:underline border-transparent": variant === "link",
            "min-h-[44px] px-4 py-2": size === "default",
            "min-h-[44px] rounded-md px-3": size === "sm",
            "min-h-[48px] rounded-md px-8": size === "lg",
            "min-h-[44px] w-11": size === "icon",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }

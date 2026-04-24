import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-white/20 bg-white/[0.06] text-white",
        secondary: "border-white/10 bg-white/[0.04] text-white/60",
        outline: "border-white/20 text-white/70",
        success:
          "border-green-400/30 bg-green-400/10 text-green-300",
        warning:
          "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
        danger:
          "border-red-400/30 bg-red-400/10 text-red-300",
        info:
          "border-sky-400/30 bg-sky-400/10 text-sky-300",
        brand:
          "border-white/30 bg-white text-black",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

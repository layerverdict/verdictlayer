import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {description ? (
          <p className="max-w-sm text-sm text-white/50">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

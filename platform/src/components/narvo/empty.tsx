import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="text-[14px] font-medium">{title}</div>
      {children && <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Skeleton lines while the model is working on a block of text. */
export function ThinkingLines({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-muted"
          style={{ width: `${92 - ((i * 17) % 40)}%`, animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Layout primitives for solution workbenches.
 *
 *   <Workbench cols="320px 1fr 360px">
 *     <Pane title="Incoming" …/>
 *   </Workbench>
 */

export function Workbench({
  children,
  cols = "320px minmax(0,1fr) 360px",
  className,
}: {
  children: ReactNode;
  cols?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("grid min-h-0 gap-4 max-lg:!grid-cols-1", className)}
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

export function Pane({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  footer,
  flush,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  /** Remove body padding (for lists/tables that go edge-to-edge) */
  flush?: boolean;
}) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col rounded-lg border border-border bg-card", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="min-w-0">
            {title && <h3 className="label-caps truncate">{title}</h3>}
            {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", !flush && "p-4", bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-border px-4 py-2.5">{footer}</footer>}
    </section>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("label-caps mb-2", className)}>{children}</div>;
}

export function KeyValue({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5 text-[13px]", className)}>
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 text-end font-medium break-words">{v}</span>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("my-3 h-px bg-border", className)} />;
}

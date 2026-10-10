import { cn } from "@/lib/utils";

/** NARVO mark: a stencil "N" built from two posts and a split diagonal. */
export function NarvoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 32" className={cn("h-6 w-auto", className)} fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="4.2" height="30" />
      <rect x="22.8" y="1" width="4.2" height="30" />
      <path d="M7.2 1h4.4l9.2 21.6V31h-0.6L7.2 7.6z" />
      <path d="M7.2 12.4l5.4 12.7V31H7.2z" opacity="0.55" />
      <path d="M20.8 1v12.2L16.1 2.2 16.6 1z" opacity="0.55" />
    </svg>
  );
}

/** Wide-tracked wordmark as on the printed catalogue. */
export function NarvoWordmark({ className, withMark = true }: { className?: string; withMark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)} dir="ltr">
      {withMark && <NarvoMark className="h-[1.35em]" />}
      <span className="text-[0.95em] font-light tracking-[0.42em]">NARVO</span>
    </span>
  );
}

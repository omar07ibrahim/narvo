"use client";

import { LoaderCircle, Play, Square } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useL } from "@/lib/i18n";

/** Primary "run the AI" button with running state and stop. */
export function RunButton({
  running,
  onRun,
  onStop,
  children,
  icon,
  disabled,
  className,
  size = "default",
  variant = "default",
}: {
  running: boolean;
  onRun: () => void;
  onStop?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary";
}) {
  const L = useL();
  if (running && onStop)
    return (
      <Button variant="outline" size={size} onClick={onStop} className={cn("gap-1.5", className)}>
        <LoaderCircle className="animate-spin text-ai" />
        {L({ en: "Working…", ar: "جارٍ العمل…" })}
        <Square className="size-3 fill-current opacity-60" />
      </Button>
    );
  return (
    <Button size={size} variant={variant} onClick={onRun} disabled={disabled || running} className={cn("gap-1.5", className)}>
      {running ? <LoaderCircle className="animate-spin" /> : (icon ?? <Play className="fill-current" />)}
      {children}
    </Button>
  );
}

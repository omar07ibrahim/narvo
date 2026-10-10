"use client";

import { cn } from "@/lib/utils";
import { useL } from "@/lib/i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Criterion, CriterionRating, Evaluation } from "../_lib/types";

export interface Row {
  id: string;
  name: string;
  nameAr?: string;
  headline: string;
  /** Job-related summary without employer/university (blind review) */
  blindHeadline: string;
  source: "application" | "upload";
  ev?: Evaluation;
  ratings: CriterionRating[];
  score: number;
  trace: number;
  interviews: number;
  nationality?: string;
}

const LEVEL = ["bg-muted", "bg-ai/20", "bg-ai/45", "bg-ai/75", "bg-ai"];

/** 0–4 rating as four small segments. */
export function RatingDots({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("h-2 w-2.5 rounded-[2px]", i <= value ? "bg-ai" : "bg-muted")} />
      ))}
      <span className="num ms-1 text-[11px] text-muted-foreground">{value}/4</span>
    </span>
  );
}

/** One square per criterion, shaded by rating — a compact fingerprint of the evaluation. */
export function RatingStrip({ ratings, criteria }: { ratings: CriterionRating[]; criteria: Criterion[] }) {
  const L = useL();
  return (
    <span className="inline-flex items-center gap-[3px]">
      {criteria.map((c) => {
        const r = ratings.find((x) => x.criterionId === c.id)?.rating ?? 0;
        return (
          <Tooltip key={c.id}>
            <TooltipTrigger asChild>
              <span className={cn("size-3.5 rounded-[3px] border border-border/60", LEVEL[r])} />
            </TooltipTrigger>
            <TooltipContent className="text-[11.5px]">
              {c.id} · {L({ en: c.label, ar: c.labelAr ?? c.label })}: {r}/4
            </TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}

/** Localised anonymous candidate label for the UI ("Candidate 0041" / "المرشح 0041"). */
export function codeOf(id: string, L: (t: { en: string; ar: string }) => string) {
  const n = id.split("-").pop();
  return L({ en: `Candidate ${n}`, ar: `المرشح ${n}` });
}

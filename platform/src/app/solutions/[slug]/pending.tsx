"use client";

import { LoaderCircle } from "lucide-react";
import { SolutionPage } from "@/components/narvo/solution-page";
import { EmptyState } from "@/components/narvo/empty";
import { useL } from "@/lib/i18n";

export function ModulePending({ slug }: { slug: string }) {
  const L = useL();
  return (
    <SolutionPage slug={slug}>
      <div className="rounded-lg border border-border bg-card">
        <EmptyState icon={<LoaderCircle className="size-4 animate-spin" />} title={L({ en: "Module is being assembled", ar: "يجري تجهيز الوحدة" })}>
          {L({ en: "This workspace is being connected to the platform.", ar: "يجري ربط مساحة العمل هذه بالمنصة." })}
        </EmptyState>
      </div>
    </SolutionPage>
  );
}

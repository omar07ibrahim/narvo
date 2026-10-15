"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Check, Cpu, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/narvo/status";
import { useL, usePrefs } from "@/lib/i18n";
import { AREAS, SOLUTIONS, pad2 } from "@/lib/solutions/registry";
import { ORGS } from "@/lib/world/orgs";
import { MODEL_OPTIONS, findModel } from "@/lib/ai/models";
import { cn } from "@/lib/utils";
import { usePlatformStatus } from "./privacy-status";

const PAGE_TITLES: Record<string, { en: string; ar: string }> = {
  "/": { en: "Command Center", ar: "مركز القيادة" },
  "/solutions": { en: "All solutions", ar: "جميع الحلول" },
  "/inbox": { en: "Approvals", ar: "الاعتمادات" },
  "/audit": { en: "Audit trail", ar: "سجل التدقيق" },
  "/knowledge": { en: "Knowledge sources", ar: "مصادر المعرفة" },
  "/stack": { en: "How it runs", ar: "كيف تعمل المنصة" },
};

function ModelSwitcher() {
  const L = useL();
  const { modelKey, setModelKey } = usePrefs();
  const status = usePlatformStatus(8000);
  const local = status?.provider === "local";
  const current = findModel(modelKey);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 bg-card font-normal">
          <Cpu className="text-ai" />
          <span className="max-w-36 truncate">{current.label}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="label-caps">{L({ en: "Model for all solutions", ar: "النموذج لجميع الحلول" })}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODEL_OPTIONS.map((m) => {
          const available = local || !!m.openrouter;
          return (
            <DropdownMenuItem
              key={m.key}
              disabled={!available}
              onClick={() => setModelKey(m.key)}
              className="flex items-start gap-2.5 py-2"
            >
              <span className="mt-0.5 flex size-4 items-center justify-center">
                {m.key === current.key && <Check className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[13px] font-medium">
                  {m.label}
                  <span className="rounded border border-border px-1 text-[9.5px] font-normal text-muted-foreground">{m.licence}</span>
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {m.publisher} · {m.params}
                </span>
                {!available && (
                  <span className="block text-[10.5px] text-warning">
                    {L({ en: "Runs on-premises only (private mode)", ar: "يعمل داخل الجهة فقط (الوضع الخاص)" })}
                  </span>
                )}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar({ onSearch }: { onSearch: () => void }) {
  const L = useL();
  const path = usePathname();
  const { lang, setLang } = usePrefs();
  const solution = SOLUTIONS.find((s) => path.startsWith(`/solutions/${s.slug}`));
  const area = solution ? AREAS.find((a) => a.id === solution.area) : undefined;
  const org = ORGS[solution?.org ?? "mnda"];
  const persona = org.persona;

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background/80 px-6 backdrop-blur">
      <nav className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
        {solution ? (
          <>
            <Link href="/solutions" className="truncate text-muted-foreground hover:text-foreground">
              {L(area!.title)}
            </Link>
            <span className="text-faint">/</span>
            <span className="num text-muted-foreground">{pad2(solution.n)}</span>
            <span className="truncate font-medium">{L(solution.title)}</span>
          </>
        ) : (
          <span className="font-medium">{L(PAGE_TITLES[path] ?? PAGE_TITLES["/"])}</span>
        )}
      </nav>

      <button
        type="button"
        onClick={onSearch}
        className="flex h-8 w-64 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:border-border-strong max-lg:w-40"
      >
        <Search className="size-3.5" />
        <span className="flex-1 truncate text-start">{L({ en: "Search solutions, actions…", ar: "ابحث في الحلول والإجراءات…" })}</span>
        <Kbd>⌘K</Kbd>
      </button>

      <div className="flex items-center rounded-md border border-border bg-card p-0.5">
        {(["en", "ar"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={cn(
              "h-7 rounded px-2.5 text-[12px] font-medium transition-colors",
              lang === l ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l === "en" ? "EN" : "ع"}
          </button>
        ))}
      </div>

      <ModelSwitcher />

      <div className="flex items-center gap-2.5 border-s border-border ps-4">
        <span className="flex size-8 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: org.color }}>
          {persona.initials}
        </span>
        <div className="leading-tight max-xl:hidden">
          <div className="text-[12.5px] font-medium">{lang === "ar" ? persona.nameAr : persona.name}</div>
          <div className="max-w-52 truncate text-[11px] text-muted-foreground">{lang === "ar" ? persona.titleAr : persona.title}</div>
        </div>
      </div>
    </header>
  );
}

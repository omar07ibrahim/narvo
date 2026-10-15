"use client";

import { useRouter } from "next/navigation";
import { Gauge, Inbox, Languages, Layers, LayoutGrid, Library, ListChecks, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { SolutionIcon } from "@/components/narvo/icons";
import { AREAS, SOLUTIONS, pad2, solutionPath } from "@/lib/solutions/registry";
import { useL, usePrefs } from "@/lib/i18n";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const L = useL();
  const { lang, setLang } = usePrefs();

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} className="sm:max-w-xl">
      <CommandInput placeholder={L({ en: "Jump to a solution or action…", ar: "انتقل إلى حل أو إجراء…" })} />
      <CommandList className="max-h-[440px]">
        <CommandEmpty>{L({ en: "No results.", ar: "لا توجد نتائج." })}</CommandEmpty>
        <CommandGroup heading={L({ en: "Platform", ar: "المنصة" })}>
          <CommandItem onSelect={() => go("/")}>
            <Gauge /> {L({ en: "Command Center", ar: "مركز القيادة" })}
          </CommandItem>
          <CommandItem onSelect={() => go("/solutions")}>
            <LayoutGrid /> {L({ en: "All solutions", ar: "جميع الحلول" })}
          </CommandItem>
          <CommandItem onSelect={() => go("/inbox")}>
            <Inbox /> {L({ en: "Approvals inbox", ar: "صندوق الاعتمادات" })}
          </CommandItem>
          <CommandItem onSelect={() => go("/audit")}>
            <ListChecks /> {L({ en: "Audit trail", ar: "سجل التدقيق" })}
          </CommandItem>
          <CommandItem onSelect={() => go("/knowledge")}>
            <Library /> {L({ en: "Knowledge sources", ar: "مصادر المعرفة" })}
          </CommandItem>
          <CommandItem onSelect={() => go("/stack")}>
            <Layers /> {L({ en: "How it runs — on-premises stack", ar: "كيف تعمل — البنية داخل الجهة" })}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        {AREAS.map((a) => (
          <CommandGroup key={a.id} heading={`${pad2(a.id)} · ${L(a.title)}`}>
            {SOLUTIONS.filter((s) => s.area === a.id).map((s) => (
              <CommandItem key={s.slug} value={`${s.n} ${s.title.en} ${s.title.ar} ${s.promise.en}`} onSelect={() => go(solutionPath(s))}>
                <SolutionIcon name={s.icon} />
                <span className="num w-5 text-muted-foreground">{pad2(s.n)}</span>
                <span>{L(s.title)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading={L({ en: "Actions", ar: "إجراءات" })}>
          <CommandItem
            onSelect={() => {
              setLang(lang === "en" ? "ar" : "en");
              onOpenChange(false);
            }}
          >
            <Languages /> {lang === "en" ? "التبديل إلى العربية" : "Switch to English"}
          </CommandItem>
          <CommandItem
            onSelect={async () => {
              onOpenChange(false);
              await fetch("/api/demo/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
              toast.success(L({ en: "All demos reset", ar: "تمت إعادة ضبط جميع العروض" }));
              router.refresh();
            }}
          >
            <RotateCcw /> {L({ en: "Reset all demo data", ar: "إعادة ضبط جميع بيانات العرض" })}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

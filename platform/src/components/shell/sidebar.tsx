"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Gauge, Inbox, LayoutGrid, Library, ListChecks, Layers } from "lucide-react";
import { NarvoWordmark } from "@/components/brand/logo";
import { AREAS, SOLUTIONS, pad2, solutionPath } from "@/lib/solutions/registry";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PrivacyStatus } from "./privacy-status";

function NavLink({
  href,
  icon,
  children,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: number;
}) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <span className="text-sidebar-muted [&_svg]:size-4">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {!!badge && (
        <span className="num rounded-full bg-[#c98a2b] px-1.5 text-[10px] leading-4 font-semibold text-black">{badge}</span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const L = useL();
  const path = usePathname();
  const [pending, setPending] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/approvals?status=pending")
        .then((r) => r.json())
        .then((d) => alive && setPending(d.approvals?.length ?? 0))
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [path]);

  return (
    <aside className="flex w-[268px] shrink-0 flex-col bg-sidebar text-sidebar-foreground max-md:hidden">
      <div className="px-5 pt-5 pb-4">
        <Link href="/" className="block text-[17px] text-white">
          <NarvoWordmark />
        </Link>
        <div className="mt-1.5 text-[10px] tracking-[0.22em] text-sidebar-muted uppercase">
          {L({ en: "Private Intelligence Platform", ar: "منصة الذكاء الخاص" })}
        </div>
      </div>

      <nav className="space-y-0.5 px-3">
        <NavLink href="/" icon={<Gauge />}>
          {L({ en: "Command Center", ar: "مركز القيادة" })}
        </NavLink>
        <NavLink href="/solutions" icon={<LayoutGrid />}>
          {L({ en: "All solutions", ar: "جميع الحلول" })}
        </NavLink>
        <NavLink href="/inbox" icon={<Inbox />} badge={pending}>
          {L({ en: "Approvals", ar: "الاعتمادات" })}
        </NavLink>
        <NavLink href="/audit" icon={<ListChecks />}>
          {L({ en: "Audit trail", ar: "سجل التدقيق" })}
        </NavLink>
        <NavLink href="/knowledge" icon={<Library />}>
          {L({ en: "Knowledge sources", ar: "مصادر المعرفة" })}
        </NavLink>
        <NavLink href="/stack" icon={<Layers />}>
          {L({ en: "How it runs", ar: "كيف تعمل المنصة" })}
        </NavLink>
      </nav>

      <div className="mx-5 mt-5 mb-2 h-px bg-sidebar-border" />

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3 [scrollbar-color:rgba(255,255,255,0.12)_transparent]">
        {AREAS.map((area) => {
          const items = SOLUTIONS.filter((s) => s.area === area.id);
          const isCollapsed = collapsed[area.id];
          return (
            <div key={area.id} className="mb-2">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [area.id]: !c[area.id] }))}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-start"
              >
                <span className="num text-[10px] text-sidebar-muted">{pad2(area.id)}</span>
                <span className="flex-1 truncate text-[10px] font-medium tracking-[0.14em] text-sidebar-muted uppercase">
                  {L(area.title)}
                </span>
                <ChevronDown className={cn("size-3 text-sidebar-muted transition-transform", isCollapsed && "-rotate-90 rtl:rotate-90")} />
              </button>
              {!isCollapsed && (
                <div className="space-y-px">
                  {items.map((s) => {
                    const href = solutionPath(s);
                    const active = path.startsWith(href);
                    return (
                      <Link
                        key={s.slug}
                        href={href}
                        className={cn(
                          "group flex items-start gap-2.5 rounded-md px-2.5 py-[5px] text-[12.5px] leading-snug transition-colors",
                          active
                            ? "bg-sidebar-accent text-white"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        )}
                      >
                        <span className={cn("num mt-px w-4 shrink-0 text-[10.5px]", active ? "text-white/70" : "text-sidebar-muted")}>
                          {pad2(s.n)}
                        </span>
                        <span className="flex-1">{L(s.title)}</span>
                        {s.hero && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#5fb8ad]" title="Hero pilot" />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-sidebar-border p-3">
        <PrivacyStatus />
      </div>
    </aside>
  );
}

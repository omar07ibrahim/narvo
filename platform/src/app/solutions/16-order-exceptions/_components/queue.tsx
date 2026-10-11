"use client";

import { useMemo, useState } from "react";
import { CircleCheck, History, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { fmtDay } from "../_lib/calendar";
import type { ExceptionHistoryItem, ExceptionType, OrderAnalysis } from "../_lib/types";
import { SEVERITY, TypeChip, TypeIcon } from "./bits";

type Tab = "all" | ExceptionType | "resolved";

const TABS: Array<{ id: Tab; en: string; ar: string }> = [
  { id: "all", en: "All", ar: "الكل" },
  { id: "stock", en: "Stock", ar: "المخزون" },
  { id: "price", en: "Price", ar: "السعر" },
  { id: "window", en: "Window", ar: "النافذة" },
  { id: "credit", en: "Credit", ar: "الائتمان" },
  { id: "resolved", en: "Done", ar: "منجزة" },
];

const SEV_BAR: Record<string, string> = { critical: "bg-danger", high: "bg-warning", medium: "bg-info", low: "bg-faint" };
const SEV_TEXT: Record<string, string> = { critical: "text-danger", high: "text-warning", medium: "text-info", low: "text-faint" };

export function ExceptionQueue({
  orders,
  history,
  selected,
  onSelect,
  customerNames,
}: {
  orders: OrderAnalysis[];
  history: ExceptionHistoryItem[];
  selected: string | null;
  onSelect: (id: string) => void;
  customerNames: Record<string, { en: string; ar: string }>;
}) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("all");
  const [showClean, setShowClean] = useState(false);

  const owners = useMemo(() => Array.from(new Set(orders.map((o) => o.order.kam))).sort(), [orders]);
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (owner === "all" || o.order.kam === owner) &&
        (!needle ||
          o.order.id.toLowerCase().includes(needle) ||
          o.order.customerName.toLowerCase().includes(needle) ||
          o.customer.nameAr.includes(q.trim()) ||
          o.order.project.toLowerCase().includes(needle) ||
          o.order.customerPo.toLowerCase().includes(needle)),
    );
  }, [orders, q, owner]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, stock: 0, price: 0, window: 0, credit: 0, resolved: 0 };
    for (const o of base) {
      if (o.exceptions.length) c.all++;
      for (const t of o.types) c[t]++;
      if (o.order.resolution) c.resolved++;
    }
    return c;
  }, [base]);

  const list = useMemo(() => {
    if (tab === "resolved") return base.filter((o) => o.order.resolution);
    if (tab === "all") return base.filter((o) => o.exceptions.length || showClean);
    return base.filter((o) => o.types.includes(tab));
  }, [base, tab, showClean]);

  const cleanCount = orders.filter((o) => !o.exceptions.length).length;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={L({ en: "Search orders", ar: "ابحث في الطلبات" })}
              className="h-8 bg-surface ps-8 text-[12.5px]"
            />
          </div>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger size="sm" className="h-8 w-[118px] bg-surface text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L({ en: "All owners", ar: "كل المسؤولين" })}</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={cn(
                "flex h-[34px] min-w-0 flex-auto flex-col items-center justify-center rounded px-1 text-[10.5px] leading-tight font-medium whitespace-nowrap transition-colors",
                tab === x.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{L(x)}</span>
              <span className="num text-[10px] text-faint">{counts[x.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="scrollbar-thin min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {list.map((o) => {
          const sel = selected === o.order.id;
          const name = customerNames[o.order.customerId]?.[lang] ?? o.order.customerName;
          const resolved = !!o.order.resolution && !o.exceptions.length;
          return (
            <li key={o.order.id}>
              <button
                type="button"
                onClick={() => onSelect(o.order.id)}
                className={cn("relative w-full px-3.5 py-3 text-start transition-colors hover:bg-muted/50", sel && "bg-ai-soft/60 hover:bg-ai-soft/60")}
              >
                {sel ? <span className="absolute inset-y-0 start-0 w-0.5 bg-ai" /> : o.severity && <span className={cn("absolute inset-y-3 start-0 w-0.5 rounded-full", SEV_BAR[o.severity])} />}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-muted-foreground">{o.order.id}</span>
                      {o.severity && <span className={cn("text-[10px] font-medium uppercase tracking-wide", SEV_TEXT[o.severity])}>{L(SEVERITY[o.severity])}</span>}
                      {resolved && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-success">
                          <CircleCheck className="size-3" />
                          {L({ en: "Resolved", ar: "تمت المعالجة" })}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] font-medium" dir="auto">
                      {name}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    {o.valueAtRisk > 0 ? (
                      <>
                        <div className="num text-[12.5px] font-medium">{f.aed(o.valueAtRisk)}</div>
                        <div className="text-[10px] text-faint">{L({ en: "at risk", ar: "معرّض للخطر" })}</div>
                      </>
                    ) : (
                      <div className="num text-[12px] text-muted-foreground">{f.aed(o.openValue)}</div>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {o.types.map((t) => (
                      <TypeChip key={t} t={t} />
                    ))}
                    {resolved && o.order.resolution!.cleared.map((t) => <TypeChip key={t} t={t} muted />)}
                    {!o.types.length && !resolved && <span className="text-[11px] text-faint">{L({ en: "No exceptions", ar: "لا استثناءات" })}</span>}
                  </div>
                  <span className={cn("shrink-0 text-[11px]", o.daysToPromise <= 1 && o.exceptions.length ? "font-medium text-danger" : "text-muted-foreground")}>
                    {fmtDay(o.order.promiseDate, lang)}
                    {o.exceptions.length ? <span className="num"> · {o.daysToPromise}{L({ en: "d", ar: "ي" })}</span> : null}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
        {!list.length && tab !== "resolved" && (
          <li className="px-4 py-10 text-center text-[12px] text-muted-foreground">{L({ en: "No orders in this view.", ar: "لا توجد طلبات في هذا العرض." })}</li>
        )}
        {tab === "resolved" && (
          <li className="bg-surface/60 px-3.5 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <History className="size-3.5 text-muted-foreground" />
              <span className="label-caps !text-[9.5px]">{L({ en: "Resolved Aug–Sep (manual process)", ar: "معالجات أغسطس–سبتمبر (يدوياً)" })}</span>
            </div>
            <ul className="space-y-1.5">
              {history
                .slice()
                .reverse()
                .map((h) => (
                  <li key={h.id} className="flex items-start gap-2 text-[11.5px]">
                    <span className="mt-0.5 flex gap-0.5 text-muted-foreground">
                      {h.types.map((t) => (
                        <TypeIcon key={t} t={t} className="size-3" />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-[10.5px] text-muted-foreground">{h.orderId}</span> <span className="text-foreground/85">{h.resolution}</span>
                    </span>
                    <span className="num shrink-0 text-muted-foreground">{h.effortMinutes}′</span>
                  </li>
                ))}
            </ul>
          </li>
        )}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
        <span>
          <span className="num">{orders.length}</span> {L({ en: "open orders", ar: "طلباً مفتوحاً" })} · <span className="num">{cleanCount}</span> {L({ en: "clean", ar: "دون استثناءات" })}
        </span>
        <label className="flex items-center gap-1.5">
          <Switch size="sm" checked={showClean} onCheckedChange={setShowClean} />
          {L({ en: "Show clean", ar: "إظهار السليمة" })}
        </label>
      </div>
    </div>
  );
}

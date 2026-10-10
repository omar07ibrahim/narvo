"use client";

import { Pane, KeyValue } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import type { Asset, BmsLog, HistoryEntry, Job, Site, Technician } from "../_lib/types";
import { BmsChart } from "./brief-view";

export function AssetView({ asset, site, history, jobs, techs, bms }: { asset: Asset; site: Site; history: HistoryEntry[]; jobs: Job[]; techs: Technician[]; bms?: BmsLog }) {
  const L = useL();
  const f = useFormat();
  const { lang } = usePrefs();
  const entries = [
    ...history.filter((h) => h.asset === asset.id).map((h) => ({ id: h.id, date: h.date, type: h.type, title: h.title, tech: h.technician, text: h.summary ?? "" })),
    ...jobs
      .filter((j) => j.asset === asset.id && j.status === "completed" && !history.some((h) => h.id === j.id))
      .map((j) => ({ id: j.id, date: (j.completedAt ?? j.raisedAt).slice(0, 10), type: j.type, title: lang === "ar" ? j.title_ar : j.title, tech: j.technician, text: j.outcome ?? "" })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const techName = (id: string) => techs.find((t) => t.id === id)?.name ?? id;

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Pane title={L({ en: "Asset record", ar: "سجل الأصل" })}>
          <div className="text-[14px] font-medium">{asset.name}</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{asset.id}</div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{asset.description}</p>
          <div className="mt-3 divide-y divide-border">
            <KeyValue k={L({ en: "Make / model", ar: "الصانع / الطراز" })} v={`${asset.make} ${asset.model}`} />
            <KeyValue k={L({ en: "Serial", ar: "الرقم التسلسلي" })} v={<span className="font-mono text-[11.5px]">{asset.serial}</span>} />
            <KeyValue k={L({ en: "Installed", ar: "التركيب" })} v={f.date(asset.installed)} />
            <KeyValue k={L({ en: "Location", ar: "الموقع" })} v={asset.location} />
            <KeyValue k={L({ en: "Site", ar: "المنشأة" })} v={`${lang === "ar" ? site.name_ar : site.name} · ${site.district}`} />
            <KeyValue k={L({ en: "Criticality", ar: "الأهمية" })} v={asset.criticality} />
            <KeyValue k={L({ en: "Last PPM", ar: "آخر صيانة وقائية" })} v={`${asset.lastPpm.type} · ${f.date(asset.lastPpm.date)}`} />
            <KeyValue k={L({ en: "Status", ar: "الحالة" })} v={asset.status} />
          </div>
          {asset.overduePpm?.map((p) => (
            <div key={p.job} className="mt-2 rounded-md border border-warning/30 bg-warning-soft/60 p-2.5 text-[11.5px]">
              <div className="font-medium text-warning">{L({ en: "Overdue PPM", ar: "صيانة وقائية متأخرة" })} · {p.job}</div>
              <div className="text-muted-foreground">
                {p.type} — {L({ en: "due", ar: "مستحقة" })} {f.date(p.due)} · {L({ en: "last done", ar: "آخر تنفيذ" })} {f.date(p.lastDone)}
              </div>
            </div>
          ))}
        </Pane>
        <Pane title={L({ en: "Contract & access", ar: "العقد والدخول" })}>
          <div className="divide-y divide-border">
            <KeyValue k={L({ en: "Client", ar: "العميل" })} v={site.client} />
            <KeyValue k={L({ en: "Contract", ar: "العقد" })} v={<span className="font-mono text-[11.5px]">{site.contract}</span>} />
            <KeyValue k={L({ en: "Contact", ar: "جهة الاتصال" })} v={`${site.contact.name} · ${site.contact.role}`} />
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{site.access}</p>
        </Pane>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {bms && bms.asset === asset.id && (
          <Pane title={L({ en: "BMS trend — Sep–Oct 2026", ar: "اتجاه نظام إدارة المبنى — سبتمبر–أكتوبر 2026" })} subtitle={bms.source}>
            <BmsChart bms={bms} />
          </Pane>
        )}
        <Pane title={L({ en: "Service history", ar: "سجل الخدمة" })} subtitle={L({ en: "RFM Connect work orders on this asset", ar: "أوامر العمل في RFM Connect لهذا الأصل" })}>
          {entries.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">{L({ en: "No history recorded.", ar: "لا يوجد سجل." })}</p>
          ) : (
            <ol className="relative space-y-4 before:absolute before:start-[5px] before:top-1 before:bottom-1 before:w-px before:bg-border">
              {entries.map((e) => (
                <li key={e.id} className="relative ps-6">
                  <span className="absolute start-0 top-1.5 size-[11px] rounded-full border-2 border-card bg-foreground/60" />
                  <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                    <span className="num">{f.date(e.date)}</span>
                    <span className="font-mono">{e.id}</span>
                    <StatusPill tone={e.type === "Reactive" ? "warning" : e.type === "Follow-up" ? "info" : "neutral"}>{e.type}</StatusPill>
                    <span>{techName(e.tech)}</span>
                  </div>
                  <div className="mt-0.5 text-[13px] font-medium" dir="auto">
                    {e.title}
                  </div>
                  {e.text && (
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground" dir="auto">
                      {e.text}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Pane>
      </div>
    </div>
  );
}

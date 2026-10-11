"use client";

import { useEffect, useMemo, useState } from "react";
import { FileBadge, Inbox, LoaderCircle, PackageCheck, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Workbench, Pane, KeyValue, SectionLabel } from "@/components/narvo/pane";
import { StatusPill } from "@/components/narvo/status";
import { EmptyState } from "@/components/narvo/empty";
import { useFormat, useL, usePrefs } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FIELD_LABELS, NAMES_AR, STATUS_META, TYPE_META, dayLabel, daysAr, optionLabel, type Employee, type ServiceRequest } from "../_lib/shared";
import { RequestTimeline, slaState } from "./timeline";
import { CertificateDialog } from "./certificate";
import { Segmented } from "./segmented";

export function ServiceDesk({
  requests,
  employees,
  onRequests,
}: {
  requests: ServiceRequest[];
  employees: Employee[];
  onRequests: (r: ServiceRequest[]) => void;
}) {
  const L = useL();
  const fmt = useFormat();
  const { lang } = usePrefs();
  const [queue, setQueue] = useState<"all" | "HR" | "IT">("all");
  const [state, setState] = useState<"open" | "all">("open");
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [cert, setCert] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const list = useMemo(
    () =>
      requests
        .filter((r) => queue === "all" || r.queue === queue)
        .filter((r) => state === "all" || !["completed", "rejected"].includes(r.status))
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    [requests, queue, state],
  );
  const r = requests.find((x) => x.id === selected) ?? list[0];
  const employee = r ? employees.find((e) => e.id === r.employeeId) : undefined;

  async function advance(to: "in_fulfilment" | "completed") {
    if (!r) return;
    setBusy(to);
    try {
      const res = await fetch("/api/solutions/11-employee-services/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance", id: r.id, to, note }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { requests: ServiceRequest[] };
      onRequests(j.requests);
      setNote("");
      toast.success(to === "completed" ? L({ en: `${r.id} completed — employee notified`, ar: `اكتمل ${r.id} — أُبلغ الموظف` }) : L({ en: `${r.id} moved to fulfilment`, ar: `نُقل ${r.id} إلى التنفيذ` }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const count = (q: "all" | "HR" | "IT") => requests.filter((x) => (q === "all" || x.queue === q) && !["completed", "rejected"].includes(x.status)).length;

  return (
    <Workbench cols="minmax(0,1fr) 420px">
      <Pane
        title={L({ en: "Service desk queue", ar: "قائمة مكتب الخدمة" })}
        subtitle={L({ en: "HR Services and IT Service Desk — sorted by SLA due time", ar: "خدمات الموارد البشرية ومكتب خدمة تقنية المعلومات — مرتبة حسب موعد مستوى الخدمة" })}
        actions={
          <>
            <Segmented
              value={queue}
              onChange={setQueue}
              items={[
                { value: "all", label: `${L({ en: "All", ar: "الكل" })} ${count("all")}` },
                { value: "HR", label: `HR ${count("HR")}` },
                { value: "IT", label: `IT ${count("IT")}` },
              ]}
            />
            <Segmented
              value={state}
              onChange={setState}
              items={[
                { value: "open", label: L({ en: "Open", ar: "مفتوحة" }) },
                { value: "all", label: L({ en: "History", ar: "السجل" }) },
              ]}
            />
          </>
        }
        flush
      >
        {list.length === 0 ? (
          <EmptyState icon={<Inbox className="size-4" />} title={L({ en: "Queue is clear", ar: "القائمة فارغة" })}>
            {L({ en: "New requests appear here as soon as employees submit them.", ar: "تظهر الطلبات الجديدة هنا فور تقديمها." })}
          </EmptyState>
        ) : (
          <div className="scrollbar-thin max-h-[640px] overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 z-[1] bg-card">
                <tr className="border-b border-border bg-muted/40">
                  {[
                    L({ en: "Request", ar: "الطلب" }),
                    L({ en: "Employee", ar: "الموظف" }),
                    L({ en: "Status", ar: "الحالة" }),
                    L({ en: "SLA", ar: "مستوى الخدمة" }),
                  ].map((h) => (
                    <th key={h} className="label-caps px-4 py-2 text-start !text-[9.5px] font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((x) => {
                  const sla = slaState(x, Date.now(), lang);
                  const dept = lang === "ar" ? (employees.find((e) => e.id === x.employeeId)?.departmentAr ?? x.department) : x.department;
                  return (
                    <tr
                      key={x.id}
                      onClick={() => setSelected(x.id)}
                      className={cn("cursor-pointer transition-colors hover:bg-muted/40", r?.id === x.id && "bg-ai-soft/40 hover:bg-ai-soft/50", x._createdAt && r?.id !== x.id && "bg-ai-soft/15")}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded border border-border px-1 font-mono text-[9.5px] text-muted-foreground">{x.queue}</span>
                          <span className="font-medium">{L(TYPE_META[x.type].label)}</span>
                        </div>
                        <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{x.id}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="truncate">{lang === "ar" ? (x.employeeNameAr ?? x.employeeName) : x.employeeName}</div>
                        <div className="truncate text-[10.5px] text-muted-foreground">{dept}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill tone={STATUS_META[x.status].tone}>{L(STATUS_META[x.status].label)}</StatusPill>
                      </td>
                      <td className="px-4 py-2.5">
                        {sla.closed ? (
                          <span className={cn("num text-[11.5px]", sla.met ? "text-success" : "text-danger")}>
                            {sla.met ? L({ en: "Met", ar: "ضمن المدة" }) : L({ en: `Late by ${sla.text}`, ar: `متأخر ${sla.text}` })}
                          </span>
                        ) : (
                          <span className={cn("num text-[11.5px]", sla.met ? (sla.diff < 4 * 3600000 ? "text-warning" : "text-muted-foreground") : "font-medium text-danger")}>
                            {sla.met ? L({ en: `due in ${sla.text}`, ar: `خلال ${sla.text}` }) : L({ en: `overdue ${sla.text}`, ar: `متأخر ${sla.text}` })}
                          </span>
                        )}
                        <div className="num text-[10px] text-faint">{fmt.date(x.dueAt, { day: "numeric", month: "short" })} {fmt.time(x.dueAt)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Pane>

      <Pane title={r ? <span className="font-mono">{r.id}</span> : L({ en: "Request", ar: "الطلب" })} actions={r ? <StatusPill tone={STATUS_META[r.status].tone}>{L(STATUS_META[r.status].label)}</StatusPill> : null}>
        {!r ? (
          <EmptyState icon={<Inbox className="size-4" />} title={L({ en: "Select a request", ar: "اختر طلباً" })} />
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-[14px] leading-snug font-medium" dir="auto">
                {L(r.title)}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                {lang === "ar" ? (r.employeeNameAr ?? r.employeeName) : r.employeeName} · {lang === "ar" ? (employee?.departmentAr ?? r.department) : r.department} ·{" "}
                {r.channel === "NARVO assistant" ? L({ en: "NARVO assistant", ar: "مساعد NARVO" }) : r.channel}
              </div>
            </div>
            <RequestTimeline r={r} />
            <div className="rounded-md border border-border bg-surface px-3 py-1.5">
              {Object.entries(r.fields)
                .filter(([, v]) => v !== "" && v != null)
                .map(([k, v]) => (
                  <KeyValue
                    key={k}
                    k={FIELD_LABELS[k] ? L(FIELD_LABELS[k]) : k}
                    v={
                      <span dir="auto">
                        {typeof v === "boolean"
                          ? v
                            ? L({ en: "Yes", ar: "نعم" })
                            : L({ en: "No", ar: "لا" })
                          : Array.isArray(v)
                            ? v.map((x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x)) ? dayLabel(String(x), lang) : String(x))).join(lang === "ar" ? "، " : ", ")
                            : /^\d{4}-\d{2}-\d{2}$/.test(String(v))
                              ? dayLabel(String(v), lang)
                              : optionLabel(k, v, lang) || String(v)}
                      </span>
                    }
                  />
                ))}
              <KeyValue k={L({ en: "Approver", ar: "المعتمِد" })} v={lang === "ar" ? (NAMES_AR[r.approver.name] ?? r.approver.name) : r.approver.name} />
              <KeyValue k={L({ en: "Service level", ar: "مستوى الخدمة" })} v={lang === "ar" ? daysAr(r.slaDays, "working") : `${r.slaDays} ${r.slaDays > 1 ? "working days" : "working day"}`} />
              {r.assignee && <KeyValue k={L({ en: "Assignee", ar: "المكلّف" })} v={r.assignee} />}
            </div>
            {r.rejectionNote && <p className="rounded-md border border-danger/25 bg-danger-soft p-2.5 text-[12px] text-danger">{r.rejectionNote}</p>}
            {r.resolution && (
              <p className="text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground">{L({ en: "Resolution", ar: "الإجراء" })}:</span> {r.resolution}
              </p>
            )}

            {r.status === "submitted" && (
              <div className="rounded-md border border-warning/30 bg-warning-soft/50 p-2.5 text-[12px]">
                {L({ en: `Waiting for ${r.approver.name} to approve (inline card or the Inbox).`, ar: `بانتظار اعتماد ${NAMES_AR[r.approver.name] ?? r.approver.name} (البطاقة المباشرة أو صندوق الوارد).` })}
              </div>
            )}
            {(r.status === "approved" || r.status === "in_fulfilment") && (
              <div className="space-y-2">
                <SectionLabel className="!mb-1">{L({ en: "Desk action", ar: "إجراء المكتب" })}</SectionLabel>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  dir="auto"
                  className="text-[12.5px]"
                  placeholder={L({ en: "Resolution note for the employee (optional)…", ar: "ملاحظة للموظف (اختيارية)…" })}
                />
                <div className="flex flex-wrap gap-1.5">
                  {r.status === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => advance("in_fulfilment")} disabled={!!busy}>
                      {busy === "in_fulfilment" ? <LoaderCircle className="animate-spin" /> : <Play className="rtl:-scale-x-100" />}
                      {L({ en: "Start fulfilment", ar: "بدء التنفيذ" })}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => advance("completed")} disabled={!!busy}>
                    {busy === "completed" ? <LoaderCircle className="animate-spin" /> : <PackageCheck />}
                    {r.type === "salary_certificate" ? L({ en: "Issue certificate & complete", ar: "إصدار الشهادة وإغلاق الطلب" }) : L({ en: "Complete", ar: "إكمال" })}
                  </Button>
                </div>
              </div>
            )}
            {r.status === "completed" && (r.type === "salary_certificate" || r.type === "hr_letter") && r.outputRef && (
              <Button size="sm" variant="outline" onClick={() => setCert(true)}>
                <FileBadge /> {L({ en: "View issued document", ar: "عرض المستند الصادر" })} · <span className="font-mono text-[11px]">{r.outputRef}</span>
              </Button>
            )}
            {r.status === "completed" && <CertificateDialog open={cert} onOpenChange={setCert} r={r} e={employee} />}
          </div>
        )}
      </Pane>
    </Workbench>
  );
}

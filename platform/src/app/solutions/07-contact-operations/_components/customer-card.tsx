"use client";

import { Check, CircleDashed, Flag, History, Lock, ShieldCheck, ShieldQuestion, UserRound } from "lucide-react";
import { useL, useFormat } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/narvo/status";
import { CENTRES, INTENT_LABEL, maskEid, maskMobile, type ConsoleData, type SessionState, type Signals } from "../_lib/types";
import { ChannelIcon, RecordStatus, SentimentMeter, initials, isolateNums, langLabel } from "./bits";

const FACTORS: Array<{ key: string; en: string; ar: string }> = [
  { key: "registered_mobile", en: "Registered mobile (caller ID / WhatsApp)", ar: "الرقم المسجّل (هوية المتصل / واتساب)" },
  { key: "emirates_id", en: "Emirates ID number", ar: "رقم الهوية الإماراتية" },
  { key: "reference_dob", en: "Case / permit number + date of birth", ar: "رقم الطلب أو الرخصة مع تاريخ الميلاد" },
];

/* Arabic rendering for record details that come from other modules' English data (districts, officers, missing items). */
const DISTRICT_AR: Record<string, string> = {
  "MN-01": "وسط المدينة",
  "MN-02": "المرجان",
  "MN-03": "جزيرة اللؤلؤ",
  "MN-04": "حدائق الواحة",
  "MN-05": "رأس المرسى الصناعية",
  "MN-06": "السدر السكنية",
  "MN-07": "مجتمع الغاف",
  "MN-08": "حي المارينا",
};
const OFFICER_AR: Record<string, string> = { "Khalfan Mohammed Al Ali": "خلفان محمد العلي", "Mariam Saeed Al Kaabi": "مريم سعيد الكعبي" };
function missingAr(item: string) {
  const date = item.match(/dated (\d{1,2}) (\w{3})\w* (\d{4})/);
  const months: Record<string, string> = { Jan: "يناير", Feb: "فبراير", Mar: "مارس", Apr: "أبريل", May: "مايو", Jun: "يونيو", Jul: "يوليو", Aug: "أغسطس", Sep: "سبتمبر", Oct: "أكتوبر", Nov: "نوفمبر", Dec: "ديسمبر" };
  if (/salary certificate/i.test(item))
    return `شهادة راتب صادرة خلال آخر 30 يوماً${date ? ` (الشهادة المقدمة بتاريخ ${date[1]} ${months[date[2]] ?? date[2]} ${date[3]})` : ""}`;
  if (/no property/i.test(item)) return "شهادة عدم ملكية عقار من دائرة الأراضي";
  if (/spouse/i.test(item) && /emirates id/i.test(item)) return "الهوية الإماراتية للزوج/الزوجة";
  if (/family book/i.test(item)) return "نسخة كاملة من خلاصة القيد";
  if (/bank statement/i.test(item)) return "كشف حساب بنكي لستة أشهر";
  if (/marriage/i.test(item)) return "عقد الزواج";
  return item;
}

export function VerificationBadge({ level }: { level: SessionState["level"] }) {
  const L = useL();
  if (level === "verified")
    return (
      <StatusPill tone="success">
        <ShieldCheck className="size-3" />
        {L({ en: "Verified · 2 factors", ar: "تم التحقق · عاملان" })}
      </StatusPill>
    );
  if (level === "partial")
    return <StatusPill tone="warning">{L({ en: "Partially verified", ar: "تحقق جزئي" })}</StatusPill>;
  return <StatusPill tone="neutral">{L({ en: "Not verified", ar: "لم يتم التحقق" })}</StatusPill>;
}

export function CustomerCard({
  data,
  customerId,
  session,
  signals,
  sentimentHistory,
  ani,
  compact,
}: {
  data: ConsoleData;
  customerId: string | null;
  session?: SessionState | null;
  signals?: Signals | null;
  sentimentHistory?: number[];
  ani?: string | null;
  compact?: boolean;
}) {
  const L = useL();
  const f = useFormat();
  const c = customerId ? data.customers.find((x) => x.id === customerId) : undefined;
  const level = session?.level ?? "none";
  const factors = session?.factors ?? [];

  const cases = c ? data.cases.filter((k) => c.housingCaseIds.includes(k.id) || k.applicant.emiratesId === c.emiratesId) : [];
  const permits = c ? data.permits.filter((p) => p.customerId === c.id) : [];
  const tickets = c ? data.tickets.filter((t) => t.customerId === c.id || c.ticketIds.includes(t.id)) : [];
  const appts = c ? data.appointments.filter((a) => a.customerId === c.id && a.status === "booked") : [];
  const past = c
    ? [
        ...data.conversations
          .filter((x) => x.customerId === c.id && x.id !== session?.conversationId)
          .map((x) => ({ at: x.startedAt, channel: x.channel, intent: x.intent, summary: x.summary, outcome: x.outcome })),
        ...c.history.map((h) => ({ ...h })),
      ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    : [];
  const last7 = past.filter((p) => Date.parse(p.at) > Date.parse("2026-10-04T00:00:00+04:00")).length;

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full text-[12px] font-medium",
            c ? "bg-foreground text-background" : "border border-dashed border-border-strong text-muted-foreground",
          )}
        >
          {c ? initials(c.name) : <UserRound className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium leading-snug text-pretty">
            {c ? c.name : L({ en: "Unidentified caller", ar: "متصل غير معروف" })}
          </div>
          {c?.nameAr && <div className="truncate text-[12.5px] text-muted-foreground" dir="rtl">{c.nameAr}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            {c ? (
              <>
                <span className="num whitespace-nowrap" dir="ltr">{maskMobile(c.mobile)}</span>
                <span className="text-faint">·</span>
                <span className="num whitespace-nowrap" dir="ltr">{maskEid(c.emiratesId)}</span>
              </>
            ) : (
              <span className="num whitespace-nowrap" dir={ani ? "ltr" : undefined}>{ani ? maskMobile(ani) : L({ en: "Number withheld", ar: "رقم محجوب" })}</span>
            )}
          </div>
          {session && (
            <div className="mt-2">
              <VerificationBadge level={level} />
            </div>
          )}
        </div>
      </div>

      {session && !compact && (
        <div className="rounded-md border border-border bg-surface p-2.5">
          <div className="label-caps !text-[9.5px] mb-1.5">{L({ en: "Identity verification · Charter §4 — enforced by tools", ar: "التحقق من الهوية · الميثاق §4 — تفرضه الأدوات" })}</div>
          <ul className="space-y-1">
            {FACTORS.map((fx) => {
              const ok = factors.includes(fx.key);
              return (
                <li key={fx.key} className={cn("flex items-center gap-1.5 text-[11.5px]", ok ? "text-foreground" : "text-muted-foreground")}>
                  {ok ? <Check className="size-3 text-success" strokeWidth={2.4} /> : <CircleDashed className="size-3 text-faint" />}
                  {L(fx)}
                </li>
              );
            })}
          </ul>
          {level !== "verified" && c && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-warning">
              <Lock className="size-3" />
              {L({ en: "Record details locked for the assistant until two factors match", ar: "تفاصيل السجل مقفلة على المساعد حتى تطابق عاملين" })}
            </p>
          )}
        </div>
      )}

      {c && (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
            <div>
              <div className="label-caps !text-[9.5px]">{L({ en: "Segment", ar: "الفئة" })}</div>
              <div className="mt-0.5 capitalize">
                {L(
                  c.segment === "citizen"
                    ? { en: "UAE national", ar: "مواطن" }
                    : c.segment === "business"
                      ? { en: "Business", ar: "منشأة" }
                      : { en: "Resident", ar: "مقيم" },
                )}
              </div>
            </div>
            <div>
              <div className="label-caps !text-[9.5px]">{L({ en: "Preferred language", ar: "اللغة المفضلة" })}</div>
              <div className="mt-0.5">{c.preferredLanguage === "ar" ? "العربية" : "English"}</div>
            </div>
            <div>
              <div className="label-caps !text-[9.5px]">{L({ en: "District", ar: "المنطقة" })}</div>
              <div className="mt-0.5 truncate">
                {c.district
                  ? L({ en: c.district, ar: `${DISTRICT_AR[c.district.slice(0, 5)] ?? c.district.slice(6)} (${c.district.slice(0, 5)})` })
                  : "—"}
              </div>
            </div>
            <div>
              <div className="label-caps !text-[9.5px]">{L({ en: "Contacts · 7 days", ar: "الاتصالات · 7 أيام" })}</div>
              <div className={cn("num mt-0.5", last7 >= 2 && "text-warning font-medium")}>{last7}</div>
            </div>
          </div>
          {!!c.flags?.length && (
            <div className="space-y-1">
              {c.flags.map((fl, i) => (
                <div key={fl} className="flex items-start gap-1.5 rounded-md bg-warning-soft/70 px-2 py-1.5 text-[11.5px] text-warning">
                  <Flag className="mt-px size-3 shrink-0" />
                  <span dir="auto">{isolateNums(L({ en: fl, ar: c.flagsAr?.[i] ?? fl }))}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {session && (signals || (sentimentHistory?.length ?? 0) > 0) && (
        <div className="rounded-md border border-border p-2.5">
          <SentimentMeter value={sentimentHistory?.at(-1) ?? signals?.sentiment ?? null} label={signals?.sentimentLabel} history={sentimentHistory} />
          {signals && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{L({ en: "Detected", ar: "المكتشف" })}:</span>
              <StatusPill tone="ai" dot={false}>{langLabel(signals.language, signals.dialect)}</StatusPill>
              <StatusPill tone="neutral" dot={false}>{L(INTENT_LABEL[signals.intent])}</StatusPill>
            </div>
          )}
        </div>
      )}

      {c && (
        <div>
          <div className="label-caps mb-1.5">{L({ en: "Open records", ar: "السجلات المفتوحة" })}</div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {cases.map((k) => (
              <li key={k.id} className="px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px]">{k.id}</span>
                  <RecordStatus status={k.status} />
                </div>
                <div className="mt-1 text-[11.5px] text-muted-foreground">
                  {L({ en: k.track === "loan" ? "Housing loan" : "Housing grant", ar: k.track === "loan" ? "قرض سكني" : "منحة سكنية" })} ·{" "}
                  <span className="num">{f.aed(k.amountRequested)}</span>
                  {k.officer ? ` · ${L({ en: k.officer, ar: OFFICER_AR[k.officer] ?? k.officer })}` : ""}
                </div>
                {!!(k.missing as string[] | undefined)?.length && (
                  <ul className="mt-1 space-y-0.5">
                    {(k.missing as string[]).map((m) => (
                      <li key={m} className="text-[11px] leading-snug text-warning" dir="auto">
                        — {L({ en: m, ar: missingAr(m) })}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {permits.map((p) => (
              <li key={p.id} className="px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px]">{p.id}</span>
                  <RecordStatus status={p.status} />
                </div>
                <div className="mt-1 text-[11.5px] text-muted-foreground">
                  {L({ en: p.serviceName, ar: p.serviceNameAr ?? p.serviceName })} · {p.plot}
                  {p.masterDeveloper ? ` · ${p.masterDeveloper}` : ""}
                </div>
              </li>
            ))}
            {tickets.map((t) => (
              <li key={t.id} className="px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px]">{t.id}</span>
                  <RecordStatus status={t.status} />
                </div>
                <div className="mt-1 truncate text-[11.5px] text-muted-foreground" dir="auto">
                  {t.live && <span className="me-1 text-ai">●</span>}
                  {t.subject}
                </div>
              </li>
            ))}
            {appts.map((a) => (
              <li key={a.id} className="px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px]">{a.id}</span>
                  <RecordStatus status={a.status} />
                </div>
                <div className="mt-1 text-[11.5px] text-muted-foreground">
                  {a.live && <span className="me-1 text-ai">●</span>}
                  {L(CENTRES[a.centre])} · <span className="num">{f.date(a.start, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" })}</span>
                </div>
              </li>
            ))}
            {!cases.length && !permits.length && !tickets.length && !appts.length && (
              <li className="px-2.5 py-2 text-[11.5px] text-muted-foreground">{L({ en: "No open records", ar: "لا توجد سجلات مفتوحة" })}</li>
            )}
          </ul>
        </div>
      )}

      {c && !compact && (
        <div>
          <div className="label-caps mb-1.5 flex items-center gap-1.5">
            <History className="size-3" />
            {L({ en: "Previous contacts", ar: "الاتصالات السابقة" })}
            <span className="num normal-case tracking-normal text-faint">({past.length})</span>
          </div>
          <ul className="space-y-1.5">
            {past.slice(0, 4).map((p, i) => (
              <li key={i} className="flex gap-2 text-[11.5px]">
                <ChannelIcon channel={p.channel} className="mt-0.5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{f.date(p.at, { day: "numeric", month: "short" })}</span>
                    <span className={cn("text-[10.5px]", p.outcome === "resolved" ? "text-success" : p.outcome.startsWith("handoff") ? "text-info" : "text-warning")}>
                      {L(
                        (
                          {
                            resolved: { en: "resolved", ar: "تم الحل" },
                            handoff: { en: "handoff", ar: "إحالة" },
                            handoff_resolved: { en: "handoff resolved", ar: "أُحيل وحُلّ" },
                            handoff_open: { en: "with agent", ar: "مع موظف" },
                            unresolved: { en: "unresolved", ar: "لم يُحل" },
                            abandoned: { en: "abandoned", ar: "متروك" },
                            in_progress: { en: "in progress", ar: "قيد المعالجة" },
                          } as Record<string, { en: string; ar: string }>
                        )[p.outcome] ?? { en: p.outcome.replace(/_/g, " "), ar: p.outcome.replace(/_/g, " ") },
                      )}
                    </span>
                  </div>
                  <p className="line-clamp-2 leading-snug" dir="auto">{isolateNums(p.summary)}</p>
                </div>
              </li>
            ))}
            {!past.length && <li className="text-[11.5px] text-muted-foreground">{L({ en: "First contact", ar: "أول تواصل" })}</li>}
          </ul>
        </div>
      )}

      {!c && session && (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
          {L({
            en: "The assistant will ask for two verification factors before discussing any record.",
            ar: "سيطلب المساعد عاملي تحقق قبل مناقشة أي سجل.",
          })}
        </p>
      )}
    </div>
  );
}

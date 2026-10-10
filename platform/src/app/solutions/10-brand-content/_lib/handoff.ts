/** Handoff pack (pure): every released variant with its facts, sources and verification record. */
import type { BrandState, Fact, ReleaseApprovalInfo, Variant } from "./types";
import { usedFactIds } from "./checks";

export interface HandoffPack {
  pack: string;
  generatedAt: string;
  product: string;
  factSheet: { id: string; version: string; approvedBy: string; facts: Array<Pick<Fact, "id" | "value" | "valueAr" | "source" | "version" | "approvedBy" | "approvedOn">> };
  release: { approver: string; approverTitle: string; approvalIds: string[]; decidedAt: string | null };
  variants: Array<{
    id: string;
    channel: string;
    language: string;
    version: number;
    headline: string | null;
    body: string;
    hashtags: string[];
    cta: string;
    facts: Array<{ id: string; value: string; source: string; version: number }>;
    verification: { verifiedAt: string; sentences: number; supported: number; openFlags: number; flagsRaised: number; flagsResolved: number; model?: string };
    releasedAt: string | null;
  }>;
}

export function buildHandoff(state: BrandState): HandoffPack {
  const released = state.variants.filter((v) => v.status === "released");
  const valid = new Set(state.facts.map((f) => f.id));
  const approvals = state.releases.filter((r: ReleaseApprovalInfo) => r.status === "approved" && r.variantIds.some((id) => released.some((v) => v.id === id)));
  const decided = approvals.map((a) => a.decidedAt ?? 0).filter(Boolean);
  const factVersion = Math.max(1, ...state.facts.map((f) => f.version));
  return {
    pack: `HANDOFF-${state.meta.sku}-${new Date().toISOString().slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    product: "Raseen ThermaShield (PNT-TS-20) — launch 1 November 2026",
    factSheet: {
      id: state.meta.id,
      version: factVersion > 1 ? `${state.meta.version} (+${state.facts.filter((f) => f.version > 1).length} updated fact(s))` : state.meta.version,
      approvedBy: `${state.meta.approvedBy}, ${state.meta.approvedByRole}`,
      facts: state.facts.map((f) => ({ id: f.id, value: f.value, valueAr: f.valueAr, source: f.source, version: f.version, approvedBy: f.approvedBy, approvedOn: f.approvedOn })),
    },
    release: {
      approver: "Hana Yousef",
      approverTitle: "Marketing & Brand Manager",
      approvalIds: approvals.map((a) => a.id),
      decidedAt: decided.length ? new Date(Math.max(...decided)).toISOString() : null,
    },
    variants: released.map((v: Variant) => {
      const ch = state.channels.find((c) => c.id === v.channel)!;
      const ids = usedFactIds(v, valid).sort();
      return {
        id: v.id,
        channel: ch.name.en,
        language: v.lang === "ar" ? "Arabic" : "English",
        version: v.version,
        headline: v.headline,
        body: v.body,
        hashtags: v.hashtags,
        cta: v.cta,
        facts: ids.map((id) => {
          const f = state.facts.find((x) => x.id === id)!;
          return { id, value: v.lang === "ar" ? f.valueAr : f.value, source: f.source, version: f.version };
        }),
        verification: {
          verifiedAt: v.verification?.ranAt ?? "",
          sentences: v.verification?.summary.sentences ?? 0,
          supported: v.verification?.summary.supported ?? 0,
          openFlags: v.verification?.flags.length ?? 0,
          flagsRaised: v.flagStats.raised,
          flagsResolved: v.flagStats.resolved,
          model: v.verification?.model,
        },
        releasedAt: v.releasedAt ?? null,
      };
    }),
  };
}

export function handoffMarkdown(p: HandoffPack): string {
  const out: string[] = [];
  out.push(`# Handoff pack — ${p.product}`);
  out.push("");
  out.push(`- Pack: ${p.pack}`);
  out.push(`- Generated: ${p.generatedAt}`);
  out.push(`- Fact sheet: ${p.factSheet.id} v${p.factSheet.version} — approved by ${p.factSheet.approvedBy}`);
  out.push(`- Released by: ${p.release.approver}, ${p.release.approverTitle}${p.release.decidedAt ? ` — ${p.release.decidedAt}` : ""} (${p.release.approvalIds.join(", ")})`);
  out.push(`- Variants: ${p.variants.length}`);
  out.push("");
  out.push("## Approved facts used");
  out.push("");
  out.push("| ID | Value | Source | Version |");
  out.push("|---|---|---|---|");
  for (const f of p.factSheet.facts) out.push(`| ${f.id} | ${f.value.replace(/\|/g, "/")} | ${f.source} | v${f.version} |`);
  for (const v of p.variants) {
    out.push("");
    out.push(`## ${v.channel} — ${v.language} (v${v.version})`);
    out.push("");
    if (v.headline) out.push(`**${v.channel.includes("email") ? "Subject" : "Headline"}:** ${v.headline}`, "");
    out.push(v.body);
    if (v.hashtags.length) out.push("", v.hashtags.join(" "));
    out.push("");
    out.push(`- CTA: ${v.cta || "—"}`);
    out.push(`- Facts used:`);
    for (const f of v.facts) out.push(`  - ${f.id} — ${f.value} (${f.source}, v${f.version})`);
    out.push(
      `- Verification: ${v.verification.sentences} sentences, ${v.verification.supported} supported/no-claim, ${v.verification.openFlags} open flags; ${v.verification.flagsResolved}/${v.verification.flagsRaised} flags resolved; verified ${v.verification.verifiedAt}${v.verification.model ? ` (${v.verification.model})` : ""}`,
    );
    out.push(`- Released: ${v.releasedAt ?? "—"}`);
  }
  out.push("");
  return out.join("\n");
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { createApproval, patchRecord, type Effect } from "@/lib/store/db";
import { computeKpis, openFlags } from "@/app/solutions/10-brand-content/_lib/checks";
import { loadChannels, loadFacts, loadMeta, loadVariants } from "@/app/solutions/10-brand-content/_lib/data";
import { COL_VARIANTS, SLUG } from "@/app/solutions/10-brand-content/_lib/types";

/**
 * Release gate: every variant in the set must be verified (full), have no open flags and not be stale.
 * Then route one approval to Hana Yousef; approving patches each variant to "released".
 */
export async function POST(req: Request) {
  const body = await readBody<{ variantIds?: string[] }>(req);
  const { modelKey, lang: ui } = getPrefs(req, body as Record<string, unknown>);
  const isAr = ui === "ar";
  const all = loadVariants();
  const requested = Array.isArray(body.variantIds) && body.variantIds.length ? body.variantIds : all.filter((v) => v.status === "ready").map((v) => v.id);
  const unknown = requested.filter((id) => !all.some((v) => v.id === id));
  if (unknown.length) return Response.json({ error: `Unknown variant(s): ${unknown.join(", ")}` }, { status: 404 });
  if (!requested.length) return Response.json({ error: "No verified variants ready for release" }, { status: 400 });

  return eventStream(
    req,
    async (emit) => {
      const facts = loadFacts();
      const meta = loadMeta();
      const channels = loadChannels();
      const s1 = emit.step("gate", isAr ? "فحص بوابة الإصدار — تحقق كامل، دون ملاحظات مفتوحة، حقائق محدثة" : "Release gate — fully verified, no open flags, current fact versions");
      const set = all.filter((v) => requested.includes(v.id));
      const blocked = set
        .map((v) => {
          const why: string[] = [];
          if (v.stale) why.push(isAr ? "قديم بعد تغيير حقيقة" : "stale after a fact change");
          if (v.verification?.mode !== "full") why.push(isAr ? "لم يُتحقق منه بالكامل" : "not fully verified");
          const open = openFlags(v).length;
          if (open) why.push(isAr ? `${open} ملاحظة مفتوحة` : `${open} open flag(s)`);
          if (v.status === "released") why.push(isAr ? "صادر مسبقاً" : "already released");
          if (!why.length && v.status !== "ready") why.push(isAr ? "غير جاهزة" : `status ${v.status}`);
          return { id: v.id, why };
        })
        .filter((b) => b.why.length);
      if (blocked.length) {
        s1.error(blocked.map((b) => `${b.id}: ${b.why.join(", ")}`).join(" · "));
        emit.data("blocked", blocked);
        throw new Error(isAr ? "بعض النسخ لا تستوفي بوابة الإصدار" : "Some variants do not pass the release gate");
      }
      const k = computeKpis(all, facts);
      s1.done(isAr ? `${set.length} نسخة مؤهلة · ${k.factsCovered}/${k.factsTotal} حقيقة مغطاة` : `${set.length} variant(s) eligible · ${k.factsCovered}/${k.factsTotal} facts covered`);

      const s2 = emit.step("route", isAr ? "توجيه طلب الإصدار إلى هناء يوسف" : "Routing release to Hana Yousef, Marketing & Brand Manager");
      const releaseId = `REL-${Date.now().toString(36).toUpperCase()}`;
      const now = new Date().toISOString();
      const factVer = facts.filter((f) => f.version > 1).map((f) => `${f.id} v${f.version}`);
      const lines = set.map((v) => {
        const ch = channels.find((c) => c.id === v.channel)!;
        return `${ch.name.en} ${v.lang.toUpperCase()} v${v.version}`;
      });
      const effects: Effect[] = [
        ...set.map(
          (v): Effect => ({
            type: "patch",
            collection: COL_VARIANTS,
            id: v.id,
            patch: { status: "released", releaseId, releasedVersion: v.version, releasedBy: "Hana Yousef" },
          }),
        ),
        {
          type: "audit",
          action: "Launch copy released",
          subject: `ThermaShield launch set ${releaseId} — ${set.length} variant(s)`,
          detail: `${lines.join("; ")}. Verified against ${meta.id}${factVer.length ? ` (${factVer.join(", ")})` : ""}.`,
        },
      ];
      const approval = createApproval({
        solution: SLUG,
        title: isAr ? `إصدار محتوى إطلاق ثيرماشيلد — ${set.length} نسخة` : `Release ThermaShield launch copy — ${set.length} variant(s)`,
        summary: `${lines.join(" · ")}. ${isAr ? "كل النسخ متحقق منها مقابل" : "All verified against"} ${meta.id}${factVer.length ? ` (${factVer.join(", ")})` : ""}; ${isAr ? "لا ملاحظات مفتوحة" : "0 open flags"}; ${isAr ? "حقائق مغطاة" : "facts covered"} ${k.factsCovered}/${k.factsTotal}.`,
        actionLabel: isAr ? "اعتماد وإصدار" : "Approve & release",
        approver: { name: "Hana Yousef", title: "Marketing & Brand Manager" },
        requestedBy: "NARVO Content Agent",
        effects,
        payload: { kind: "release", releaseId, variantIds: set.map((v) => v.id), versions: Object.fromEntries(set.map((v) => [v.id, v.version])) },
      });
      for (const v of set) patchRecord(COL_VARIANTS, v.id, { releaseId, releaseApprovalId: approval.id, releaseRequestedAt: now });
      s2.waiting(isAr ? `${approval.id} بانتظار القرار` : `${approval.id} awaiting decision`);
      emit.send({
        type: "approval",
        approval: {
          id: approval.id,
          title: approval.title,
          summary: approval.summary,
          solution: SLUG,
          actionLabel: approval.actionLabel,
          approver: approval.approver,
          status: "pending",
          createdAt: approval.createdAt,
        },
      });
      emit.data("release", { releaseId, approvalId: approval.id, variantIds: set.map((v) => v.id) });
    },
    { modelKey },
  );
}

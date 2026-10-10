import { eventStream, readBody } from "@/lib/ai/stream";
import { getPrefs } from "@/lib/ai/request";
import { generateObject } from "@/lib/ai/json";
import { chatStream } from "@/lib/ai/client";
import { addAudit } from "@/lib/store/db";
import { getOptions, getProposal, loadSnapshot, markOpened, saveOptions } from "@/app/solutions/16-order-exceptions/_lib/data";
import { OptionsSchema } from "@/app/solutions/16-order-exceptions/_lib/schemas";
import { ACTIONS_GUIDE, ORG_CONTEXT, citationsText, langLine, optionsFacts, policyCitations } from "@/app/solutions/16-order-exceptions/_lib/prompts";
import { applyProposal } from "@/app/solutions/16-order-exceptions/_lib/proposal";
import { analyzeWorld } from "@/app/solutions/16-order-exceptions/_lib/detect";
import { evaluateOption, impactDigest } from "@/app/solutions/16-order-exceptions/_lib/impact";
import { SLUG, fmtNum } from "@/app/solutions/16-order-exceptions/_lib/rules";
import type { OptionImpact, ProposedOption } from "@/app/solutions/16-order-exceptions/_lib/types";

export const maxDuration = 180;

/** Last generated options for an order (persisted so a reload keeps the comparison). */
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("orderId");
  if (!orderId) return Response.json({ error: "orderId is required" }, { status: 400 });
  return Response.json({ stored: getOptions(orderId) });
}

export async function POST(req: Request) {
  const body = await readBody<{ orderId?: string; useProposal?: boolean }>(req);
  const { modelKey, lang } = getPrefs(req, body);
  const ar = lang === "ar";
  if (!body.orderId) return Response.json({ error: "orderId is required" }, { status: 400 });
  const snapshot = loadSnapshot();
  const order0 = snapshot.orders.find((o) => o.id === body.orderId);
  if (!order0) return Response.json({ error: `Order ${body.orderId} not found` }, { status: 404 });

  return eventStream(
    req,
    async (emit) => {
      const s0 = emit.step("load", ar ? "تحميل الطلب والمخزون والوارد والائتمان" : "Loading order, stock, inbound and credit position");
      const proposal = body.useProposal === false ? null : getProposal(order0.id);
      const order = applyProposal(snapshot, order0, proposal);
      const world = analyzeWorld(snapshot, { orders: snapshot.orders.map((o) => (o.id === order.id ? order : o)) });
      const oa = world.byId[order.id];
      if (!oa.exceptions.length) {
        s0.error(ar ? "لا توجد استثناءات مفتوحة" : "No open exceptions");
        throw new Error(ar ? "لا توجد استثناءات مفتوحة على هذا الطلب." : "This order has no open exceptions to resolve.");
      }
      markOpened(order.id);
      s0.done(
        ar
          ? `${oa.exceptions.length} استثناءات (${oa.types.join("، ")})${proposal ? " · يشمل رسالة المتعامل" : ""}`
          : `${oa.exceptions.length} exceptions (${oa.types.join(", ")})${proposal ? " · includes the customer's message" : ""}`,
      );

      const s1 = emit.step("policy", ar ? "استرجاع بنود السياسات والعقود ذات الصلة" : "Retrieving the policy and contract clauses that apply");
      const citations = policyCitations(oa.types);
      emit.data("citations", citations);
      s1.done(citations.map((c) => c.ref ?? c.docId).filter((v, i, a) => a.indexOf(v) === i).join(" · "));

      const s2 = emit.step("propose", ar ? "اقتراح خيارات المعالجة كإجراءات محددة" : "Proposing resolution options as typed actions");
      const facts = optionsFacts(snapshot, world, oa, proposal);
      const { object } = await generateObject({
        schema: OptionsSchema,
        name: "resolution_options",
        system: [
          ORG_CONTEXT,
          "You are the order-exception planner for RBM. Propose 3 (at most 4) genuinely different resolution options for the sales order below, expressed as typed actions with parameters. RBM's planning engine will validate every parameter and compute the delivery promise per line, extra cost, margin and credit exposure — so be precise and use only the quantities, POs, dates and amounts given in the facts.",
          "Good option sets for a rebar shortfall usually compare: (a) split — ship what is available now, balance from the inbound PO after the mill restarts; (b) transfer free stock from the other warehouse plus balance from inbound; (c) alternative supplier for the shortfall. Every option must also fix the price mismatch, place the first drop in a valid site slot, and handle credit. Make credit handling a real trade-off across options: the plain split ships only what stays within the limit and holds the balance for the customer's overdue payment (hold_for_payment); an option that ships more tonnage early (transfer or alternative supplier) is pointless if that tonnage is held, so it must carry a partial_credit_release sized to the exposure it adds above the limit (use the release figures in the facts, rounded up to the next AED 1,000, never above the 15% cap) — that routes it to the Group CFO.",
          ACTIONS_GUIDE,
          langLine(lang) + " Cite the numbered SOURCES as [n] in rationale where a rule comes from a source; never write other bracket tags such as [Facts] or [Customer Msg].",
          "",
          "SOURCES",
          citationsText(citations),
        ].join("\n"),
        user: facts,
        modelKey,
        solution: SLUG,
        task: "options.propose",
        maxTokens: 2600,
        signal: emit.signal,
      });
      s2.done(ar ? `${object.options.length} خيارات · التوصية ${object.recommended}` : `${object.options.length} options · recommends ${object.recommended}`);

      const s3 = emit.step("validate", ar ? "التحقق من كل إجراء وحساب الأثر (المخزون، الموعد، التكلفة، الهامش، الائتمان)" : "Validating each action and computing impact — promise, cost, margin, credit");
      const evaluated: Array<{ option: ProposedOption; impact: OptionImpact }> = [];
      for (const opt of object.options as ProposedOption[]) {
        const impact = evaluateOption(snapshot, order, opt, proposal);
        evaluated.push({ option: opt, impact });
        emit.data("options", [...evaluated]);
      }
      const feasible = evaluated.filter((e) => e.impact.feasible).length;
      emit.data("recommended", { id: object.recommended, reason: object.recommendedReason });
      s3.done(
        ar
          ? `${feasible} من ${evaluated.length} قابلة للتنفيذ · ${evaluated.map((e) => `${e.option.id}: ${e.impact.firstDelivery?.slice(5, 10) ?? "—"}→${e.impact.lastDelivery?.slice(5, 10) ?? "—"}`).join(" · ")}`
          : `${feasible} of ${evaluated.length} feasible · ${evaluated.map((e) => `${e.option.id}: extra AED ${fmtNum(e.impact.extraCost)}, exposure ${fmtNum(e.impact.exposurePctAfter * 100, 1)}%`).join(" · ")}`,
      );

      const s4 = emit.step("brief", ar ? "كتابة ملخص المقارنة للمخطط" : "Writing the planner's comparison");
      const digests = evaluated.map((e) => impactDigest(snapshot, order, e.option, e.impact)).join("\n\n");
      const gen = chatStream({
        messages: [
          {
            role: "system",
            content: [
              ORG_CONTEXT,
              "You brief RBM's Supply Chain & Planning Manager (Joseph Abraham) on resolution options for an order exception. The numbers below were computed by the planning engine — quote them exactly, do not recompute or invent.",
              "Write 110–170 words: one short paragraph comparing the options on delivery promise, extra cost / margin and credit exposure, then one line 'Recommendation:' naming the option and the approvals it needs. Mention any option the engine marked NOT feasible and why. Cite rules as [n] using the sources. No headings, no tables.",
              langLine(lang),
            ].join("\n"),
          },
          { role: "user", content: `SOURCES\n${citationsText(citations)}\n\nOPTIONS (computed)\n${digests}\n\nModel's own recommendation: ${object.recommended} — ${object.recommendedReason}` },
        ],
        modelKey,
        solution: SLUG,
        task: "options.brief",
        maxTokens: 700,
        temperature: 0.3,
        signal: emit.signal,
      });
      let brief = "";
      for (let n = await gen.next(); !n.done; n = await gen.next()) {
        if (n.value.content) {
          brief += n.value.content;
          emit.text(n.value.content, "brief");
        }
      }
      s4.done();

      saveOptions({
        orderId: order.id,
        createdAt: Date.now(),
        proposalId: proposal?.id ?? null,
        options: evaluated,
        recommended: object.recommended,
        recommendedReason: object.recommendedReason,
        citations,
        brief,
      });
      addAudit({
        solution: SLUG,
        actor: { name: "NARVO Agent", role: "AI agent", kind: "agent" },
        action: "Generated resolution options",
        subject: order.id,
        detail: evaluated.map((e) => `${e.option.id} ${e.option.title} — ${e.impact.feasible ? "feasible" : "not feasible"}, extra AED ${fmtNum(e.impact.extraCost)}, exposure ${fmtNum(e.impact.exposurePctAfter * 100, 1)}%`).join(" | "),
      });
    },
    { modelKey },
  );
}

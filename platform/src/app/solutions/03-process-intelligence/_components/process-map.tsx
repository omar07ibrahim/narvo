"use client";

import { memo, useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useL } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { computeDfg, fmt0, fmt1, type DfgEdge, type PCase, type PLog } from "../_lib/mining";
import { activityLabel } from "./labels";

type ActivityData = { label: string; cases: number; coverage: number; events: number; start: boolean; end: boolean; lane: number };

const ActivityNode = memo(function ActivityNode({ data }: NodeProps<Node<ActivityData>>) {
  return (
    <div
      className={cn(
        "w-[214px] rounded-md border bg-card px-3 py-2 text-start",
        data.start || data.end ? "border-foreground/50" : "border-border-strong",
        data.lane !== 0 && "bg-surface",
      )}
    >
      <Handle id="t" type="target" position={Position.Top} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      <Handle id="rs" type="source" position={Position.Right} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      <Handle id="rt" type="target" position={Position.Right} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      <Handle id="ls" type="source" position={Position.Left} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      <Handle id="lt" type="target" position={Position.Left} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      <div className="truncate text-[12.5px] leading-tight font-medium" title={data.label}>
        {data.label}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
        <span className="num">{fmt0(data.cases)}</span>
        <span className="num">{fmt0(data.coverage * 100)}%</span>
      </div>
      <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/60" style={{ width: `${Math.max(2, data.coverage * 100)}%` }} />
      </div>
      <Handle id="b" type="source" position={Position.Bottom} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
    </div>
  );
});

const nodeTypes = { activity: ActivityNode };

const ROW = 104;
const LANE = 290;

/** Layered layout: frequent activities on the main spine, side chains (return loop, NOC hold, …) in lanes. */
function layout(nodes: ReturnType<typeof computeDfg>["nodes"], edges: DfgEdge[]) {
  const sorted = [...nodes].sort((a, b) => a.meanPos - b.meanPos);
  const startId = sorted[0]?.id;
  const endId = [...nodes].sort((a, b) => b.meanPos - a.meanPos)[0]?.id;
  const main = sorted.filter((n) => n.coverage >= 0.5 || n.id === startId || n.id === endId);
  const mainIds = new Set(main.map((n) => n.id));
  const side = sorted.filter((n) => !mainIds.has(n.id));
  const inbound = (id: number) => edges.filter((e) => e.to === id).sort((a, b) => b.count - a.count);
  // anchor of each side node = strongest main predecessor (inherited through side chains)
  const anchor = new Map<number, number>();
  for (const s of side) {
    const ins = inbound(s.id);
    const m = ins.find((e) => mainIds.has(e.from));
    const sp = ins.find((e) => anchor.has(e.from));
    if (sp && (!m || sp.count > m.count)) anchor.set(s.id, anchor.get(sp.from)!);
    else anchor.set(s.id, m?.from ?? startId);
  }
  // group side nodes into chains (connected through side-to-side edges)
  const chainOf = new Map<number, number>();
  let chainId = 0;
  for (const s of side) {
    const link = inbound(s.id).find((e) => chainOf.has(e.from) && anchor.get(e.from) === anchor.get(s.id));
    chainOf.set(s.id, link ? chainOf.get(link.from)! : chainId++);
  }
  const chains = new Map<number, number[]>();
  for (const s of side) chains.set(chainOf.get(s.id)!, [...(chains.get(chainOf.get(s.id)!) ?? []), s.id]);
  const pos = new Map<number, { x: number; y: number; lane: number }>();
  let row = 0;
  for (const m of main) {
    pos.set(m.id, { x: 0, y: row * ROW, lane: 0 });
    const mine = [...chains.values()].filter((c) => anchor.get(c[0]) === m.id);
    let extra = 0;
    mine.forEach((c, i) => {
      const lane = (i % 2 === 0 ? 1 : -1) * (Math.floor(i / 2) + 1);
      c.forEach((id, k) => pos.set(id, { x: lane * LANE, y: (row + 1 + k) * ROW, lane }));
      extra = Math.max(extra, c.length);
    });
    row += 1 + extra;
  }
  return { pos, startId, endId };
}

export function ProcessMap({ log, cases, lang }: { log: PLog; cases: PCase[]; lang: "en" | "ar" }) {
  const L = useL();
  const [labelMode, setLabelMode] = useState<"both" | "freq" | "time">("both");
  const [sel, setSel] = useState<string | null>(null);
  const dfg = useMemo(() => computeDfg(log, cases), [log, cases]);
  const { nodes, edges, bottlenecks, maxCount } = useMemo(() => {
    const minCount = Math.max(2, cases.length * 0.01);
    const visEdges = dfg.edges.filter((e) => e.count >= minCount);
    const { pos, startId, endId } = layout(dfg.nodes, visEdges);
    const maxCount = Math.max(1, ...visEdges.map((e) => e.count));
    const significant = visEdges.filter((e) => e.count >= Math.max(5, cases.length * 0.05));
    const bottlenecks = new Set(
      [...significant]
        .sort((a, b) => b.meanDays - a.meanDays)
        .slice(0, 3)
        .map((e) => `${e.from}>${e.to}`),
    );
    const nodes: Node<ActivityData>[] = dfg.nodes.map((n) => {
      const p = pos.get(n.id) ?? { x: 0, y: 0, lane: 0 };
      return {
        id: String(n.id),
        type: "activity",
        position: { x: p.x, y: p.y },
        data: { label: activityLabel(n.label, lang), cases: n.cases, coverage: n.coverage, events: n.events, start: n.id === startId, end: n.id === endId, lane: p.lane },
        draggable: false,
        selectable: false,
      };
    });
    const edges: Edge[] = visEdges.map((e) => {
      const ps = pos.get(e.from)!;
      const pt = pos.get(e.to)!;
      const key = `${e.from}>${e.to}`;
      const hot = bottlenecks.has(key);
      const back = pt.y <= ps.y;
      const w = 1 + 6.5 * Math.sqrt(e.count / maxCount);
      const color = hot ? "var(--warning)" : "var(--foreground)";
      const label =
        labelMode === "freq" ? fmt0(e.count) : labelMode === "time" ? `${fmt1(e.meanDays)} d` : `${fmt0(e.count)} · ${fmt1(e.meanDays)} d`;
      const useRight = (ps.lane >= 0 && pt.lane >= 0) || ps.lane > 0;
      return {
        id: key,
        source: String(e.from),
        target: String(e.to),
        sourceHandle: back ? (useRight ? "rs" : "ls") : "b",
        targetHandle: back ? (useRight ? "rt" : "lt") : "t",
        type: "default",
        label,
        labelStyle: { fontSize: 10.5, fontFamily: "var(--font-mono)", fill: hot ? "var(--warning)" : "var(--muted-foreground)", fontWeight: hot ? 600 : 400 },
        labelBgStyle: { fill: "var(--card)", fillOpacity: 0.95 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        style: { stroke: color, strokeWidth: sel === key ? w + 1.5 : w, opacity: hot ? 0.9 : 0.22 + 0.5 * (e.count / maxCount) },
        markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color, markerUnits: "userSpaceOnUse" },
        interactionWidth: 14,
      } satisfies Edge;
    });
    return { nodes, edges, bottlenecks, maxCount };
  }, [dfg, cases.length, labelMode, sel, lang]);
  const selected = sel ? dfg.edges.find((e) => `${e.from}>${e.to}` === sel) : null;
  const ranked = [...dfg.edges].filter((e) => bottlenecks.has(`${e.from}>${e.to}`)).sort((a, b) => b.meanDays - a.meanDays);
  void maxCount;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-6 rounded bg-foreground/60" /> {L({ en: "thickness = cases", ar: "السماكة = عدد الحالات" })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-6 rounded bg-warning" /> {L({ en: "bottleneck (longest waits)", ar: "اختناق (أطول انتظار)" })}
          </span>
          <span>{L({ en: "labels: transitions · mean wait", ar: "التسميات: عدد الانتقالات · متوسط الانتظار" })}</span>
        </div>
        <ToggleGroup type="single" size="sm" variant="outline" value={labelMode} onValueChange={(v) => v && setLabelMode(v as typeof labelMode)}>
          <ToggleGroupItem value="both" className="px-2 text-[11.5px]">
            {L({ en: "Both", ar: "كلاهما" })}
          </ToggleGroupItem>
          <ToggleGroupItem value="freq" className="px-2 text-[11.5px]">
            {L({ en: "Frequency", ar: "التكرار" })}
          </ToggleGroupItem>
          <ToggleGroupItem value="time" className="px-2 text-[11.5px]">
            {L({ en: "Waiting time", ar: "زمن الانتظار" })}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="h-[640px] overflow-hidden rounded-md border border-border bg-surface" dir="ltr">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.3}
          maxZoom={1.6}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          panOnScroll
          zoomOnScroll={false}
          onEdgeClick={(_, e) => setSel((s) => (s === e.id ? null : e.id))}
          onPaneClick={() => setSel(null)}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} size={1} color="var(--border)" />
          <Controls showInteractive={false} position="bottom-right" className="!shadow-none [&>button]:!border-border [&>button]:!bg-card" />
        </ReactFlow>
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <div className="rounded-md border border-border p-3">
          <div className="label-caps mb-2">{L({ en: "Bottlenecks — longest average waits", ar: "الاختناقات — أطول متوسط انتظار" })}</div>
          <ul className="space-y-1.5">
            {ranked.map((e) => (
              <li key={`${e.from}>${e.to}`}>
                <button type="button" onClick={() => setSel(`${e.from}>${e.to}`)} className="flex w-full items-baseline justify-between gap-3 text-start text-[12px] hover:text-foreground">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {activityLabel(log.activities[e.from], lang)} <span className="text-faint">{lang === "ar" ? "←" : "→"}</span> {activityLabel(log.activities[e.to], lang)}
                  </span>
                  <span className="num shrink-0 font-medium text-warning">{fmt1(e.meanDays)} d</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="label-caps mb-2">{L({ en: "Selected transition", ar: "الانتقال المحدد" })}</div>
          {selected ? (
            <div className="text-[12px]">
              <div className="font-medium">
                {activityLabel(log.activities[selected.from], lang)} {lang === "ar" ? "←" : "→"} {activityLabel(log.activities[selected.to], lang)}
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                {[
                  [L({ en: "Transitions", ar: "الانتقالات" }), fmt0(selected.count)],
                  [L({ en: "Median", ar: "الوسيط" }), `${fmt1(selected.medianDays)} d`],
                  [L({ en: "Mean", ar: "المتوسط" }), `${fmt1(selected.meanDays)} d`],
                  ["P90", `${fmt1(selected.p90Days)} d`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="label-caps !text-[9px]">{k}</div>
                    <div className="num mt-0.5 text-[14px] font-light">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">{L({ en: "Click an arrow on the map to see its waiting-time distribution.", ar: "انقر على سهم في الخريطة لعرض توزيع زمن الانتظار." })}</p>
          )}
        </div>
      </div>
    </div>
  );
}

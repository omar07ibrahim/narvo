import "server-only";
import type { Citation } from "@/lib/ai/events";
import { correlationEvidence, detectAnomalies } from "./signals";
import { CLEAN_AT, loadBookings, loadComplaints, loadContract, loadEnergy, loadJobs, loadPpm, loadSeries, loadSites, loadTrips } from "./data";

export interface Src {
  n: number;
  text: string;
  citation: Citation;
}

/** Numbered sources for the Al Ghaf correlation: computed evidence, records, complaints, contract. */
export function buildCorrelationSources() {
  const { agc } = loadSeries();
  const sites = loadSites();
  const site = sites.find((s) => s.id === "AGC")!;
  const trips = loadTrips();
  const complaints = loadComplaints();
  const jobs = loadJobs();
  const ppm = loadPpm();
  const contract = loadContract();
  const energy = loadEnergy();
  const anomalies = detectAnomalies(agc, site.zones);
  const evidence = correlationEvidence(agc, {
    trips,
    complaints,
    jobs,
    ppmDue: "2026-08-15",
    cleanAt: CLEAN_AT,
    energy: { sep25: energy.months[8].y2025, sep26: energy.months[8].y2026 ?? 0 },
  });
  const out: Src[] = [];
  const push = (title: string, ref: string, section: string, text: string, docId: string) => {
    const n = out.length + 1;
    out.push({ n, text, citation: { n, docId, title, ref, section, quote: text } });
  };
  for (const e of evidence) push(e.title, "Computed from BMS trends and records", "Signals & correlation", e.text, `EV-${e.key}`);
  const ch02 = ppm.find((p) => p.id === "PPM-AGC-CH02-CCC")!;
  push("PPM record — CH-02 condenser coil cleaning", ch02.id, "CAFM", `${ch02.task} (${ch02.frequency}); last done ${ch02.lastDone}; due ${ch02.due}; status ${ch02.status}. History: ${ch02.history.map((h) => `${h.date}: ${h.event}`).join(" ")}`, ch02.id);
  const ch01 = ppm.find((p) => p.id === "PPM-AGC-CH01-CCC")!;
  push("PPM record — CH-01 condenser coil cleaning", ch01.id, "CAFM", `${ch01.task}; last done ${ch01.lastDone}; due ${ch01.due}; status ${ch01.status}.`, ch01.id);
  const j = jobs.find((x) => x.id === "JOB-RFM-26-04471")!;
  push("Contractor job JOB-RFM-26-04471", j.id, "RFM Connect", `${j.title}. Raised ${j.raisedAt.slice(0, 16)} by ${j.supervisor}; technician ${j.technician}; status: ${j.status}. ${j.resolution}`, j.id);
  const note = jobs.find((x) => x.resolution?.includes("visibly dusty"));
  if (note) push(`Reactive job ${note.id}`, note.id, "RFM Connect", `${note.raisedAt.slice(0, 10)} — ${note.resolution}`, note.id);
  for (const ref of ["Schedule 3 §2.1", "§3.6", "§4.2", "Schedule 4"]) {
    const c = contract.clauses.find((x) => x.ref === ref)!;
    push(`Contract ${contract.id} — ${c.title}`, `${contract.id} ${c.ref}`, "Contract", c.text, `${contract.id}-${c.ref}`);
  }
  const ch02asset = site.assets.find((a) => a.id === "CH-02")!;
  push("Asset register — CH-02", "CH-02", "Asset register", `${ch02asset.name}, ${ch02asset.capacityTR} TR, installed ${ch02asset.installed}; location: ${ch02asset.location}. ${ch02asset.note}`, "ASSET-CH-02");
  const tripDays = new Set(trips.map((t) => t.at.slice(0, 10)));
  const events = loadBookings().filter((b) => tripDays.has(b.start.slice(0, 10)) && Number(b.start.slice(11, 13)) < 17);
  push(
    "Multipurpose Hall bookings on trip days",
    "Space booking system",
    "Space use",
    `Afternoon events in the Multipurpose Hall on CH-02 trip days: ${events.map((b) => `${b.start.slice(0, 10)} ${b.start.slice(11, 16)}–${b.end.slice(11, 16)} ${b.title} (${b.expected} expected)`).join("; ")}.`,
    "BOOKINGS",
  );
  const pick = ["Z-MPH", "Z-LF"];
  const sample = complaints
    .filter((c) => c.site === "AGC" && pick.includes(c.zone))
    .filter((_, i) => i % 3 === 0)
    .slice(0, 6);
  for (const c of sample) push(`Complaint ${c.id}`, `${c.id} · ${c.channel}`, c.zone === "Z-MPH" ? "Multipurpose Hall" : "Ladies' Fitness", `${c.receivedAt.slice(0, 16).replace("T", " ")} — ${c.text}`, c.id);
  return { sources: out, anomalies, evidence, trips, complaints };
}

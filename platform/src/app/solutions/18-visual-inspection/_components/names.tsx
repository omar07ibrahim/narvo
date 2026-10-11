"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePrefs } from "@/lib/i18n";

/** English record value → Arabic display text (contractors, inspectors, consultants, approver). */
const NamesCtx = createContext<Record<string, string>>({});

export function NamesProvider({ map, children }: { map: Record<string, string>; children: ReactNode }) {
  return <NamesCtx.Provider value={map}>{children}</NamesCtx.Provider>;
}

/**
 * Returns `tr(en, ar?)`: in the Arabic UI it prefers the record's own Arabic field, then the registry
 * translation of the English value, and falls back to the English value; in English it returns `en`.
 */
export function useTr() {
  const map = useContext(NamesCtx);
  const { lang } = usePrefs();
  return (en?: string | null, ar?: string | null) => (lang === "ar" ? ar || (en ? map[en] : undefined) || en || "" : en || "");
}

export const INSPECTION_TYPE: Record<string, { en: string; ar: string }> = {
  Routine: { en: "Routine", ar: "تفتيش دوري" },
  "Complaint follow-up": { en: "Complaint follow-up", ar: "متابعة بلاغ" },
  "Re-inspection": { en: "Re-inspection", ar: "إعادة تفتيش" },
  "Ad-hoc capture": { en: "Ad-hoc capture", ar: "التقاط ميداني" },
};

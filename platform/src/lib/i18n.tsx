"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type Lang = "en" | "ar";

export const LANG_COOKIE = "narvo-lang";
export const MODEL_COOKIE = "narvo-model";

interface PrefsValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  modelKey: string;
  setModelKey: (k: string) => void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

export function PrefsProvider({
  initialLang,
  initialModel,
  children,
}: {
  initialLang: Lang;
  initialModel: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [modelKey, setModelState] = useState(initialModel);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      writeCookie(LANG_COOKIE, l);
      document.documentElement.lang = l;
      document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
      router.refresh();
    },
    [router],
  );

  const setModelKey = useCallback((k: string) => {
    setModelState(k);
    writeCookie(MODEL_COOKIE, k);
  }, []);

  const value = useMemo<PrefsValue>(
    () => ({ lang, dir: lang === "ar" ? "rtl" : "ltr", setLang, modelKey, setModelKey }),
    [lang, setLang, modelKey, setModelKey],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside PrefsProvider");
  return ctx;
}

/**
 * Bilingual text helper:
 *   const L = useL();
 *   L({ en: "Incoming applications", ar: "الطلبات الواردة" })
 *   L("Plain string is returned as-is")
 */
export function useL() {
  const { lang } = usePrefs();
  return useCallback(
    (t: { en: string; ar: string } | string | undefined | null) => {
      if (t == null) return "";
      if (typeof t === "string") return t;
      return lang === "ar" ? t.ar || t.en : t.en;
    },
    [lang],
  );
}

/** Format numbers/dates for the current language (Latin digits kept for clarity in both). */
export function useFormat() {
  const { lang } = usePrefs();
  return useMemo(
    () => ({
      number: (n: number, opts?: Intl.NumberFormatOptions) =>
        new Intl.NumberFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-AE", opts).format(n),
      aed: (n: number) =>
        new Intl.NumberFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-AE", {
          style: "currency",
          currency: "AED",
          maximumFractionDigits: 0,
        }).format(n),
      date: (d: string | number | Date, opts?: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", opts ?? { day: "numeric", month: "short", year: "numeric" }).format(
          new Date(d),
        ),
      time: (d: string | number | Date) =>
        new Intl.DateTimeFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(d)),
      relative: (ts: number) => {
        const diff = Math.round((ts - Date.now()) / 1000);
        const rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar" : "en", { numeric: "auto" });
        const abs = Math.abs(diff);
        if (abs < 60) return rtf.format(diff, "second");
        if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
        if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
        return rtf.format(Math.round(diff / 86400), "day");
      },
    }),
    [lang],
  );
}

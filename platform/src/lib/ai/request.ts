import "server-only";

/**
 * Read per-request preferences sent by the client hook (`useNarvoRun`) or stored in cookies:
 * the selected model (model switcher) and UI language.
 */
export function getPrefs(req: Request, body?: Record<string, unknown>): { modelKey: string | null; lang: "en" | "ar" } {
  const cookie = req.headers.get("cookie") ?? "";
  const read = (name: string) => {
    const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  };
  const modelKey = (typeof body?.modelKey === "string" && body.modelKey) || read("narvo-model");
  const langRaw = (typeof body?.lang === "string" && body.lang) || read("narvo-lang");
  return { modelKey: modelKey || null, lang: langRaw === "ar" ? "ar" : "en" };
}

export function langName(lang: "en" | "ar") {
  return lang === "ar" ? "Arabic (Modern Standard Arabic, UAE government register)" : "English";
}

/** Direction of a generated text by its script (a brief written in English stays LTR inside the Arabic UI). */
export function textDir(text: string | undefined | null): "rtl" | "ltr" {
  if (!text) return "ltr";
  const ar = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const lat = (text.match(/[A-Za-z]/g) ?? []).length;
  return ar > lat * 0.6 ? "rtl" : "ltr";
}

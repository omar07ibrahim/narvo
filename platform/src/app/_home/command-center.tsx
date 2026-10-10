"use client";

import { useL } from "@/lib/i18n";

export function CommandCenter() {
  const L = useL();
  return (
    <div className="mx-auto max-w-[1680px] px-6 py-8">
      <h1 className="display-title text-4xl">{L({ en: "Command Center", ar: "مركز القيادة" })}</h1>
    </div>
  );
}

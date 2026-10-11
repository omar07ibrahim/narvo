"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start px-6 pt-24">
      <div className="label-caps">Something went wrong</div>
      <h1 className="display-title mt-3 text-[36px] leading-tight">This view could not be displayed.</h1>
      <p className="mt-3 text-[14px] text-muted-foreground">{error.message || "An unexpected error occurred."} Nothing was changed — try again.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-9 items-center rounded-md bg-foreground px-4 text-[13px] font-medium text-background"
      >
        Try again
      </button>
    </div>
  );
}

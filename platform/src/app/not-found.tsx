import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start px-6 pt-24">
      <div className="label-caps">404</div>
      <h1 className="display-title mt-3 text-[40px] leading-tight">This page is not part of the platform.</h1>
      <p className="mt-3 text-[14px] text-muted-foreground">The address may have changed. Every solution is listed in the catalogue.</p>
      <div className="mt-6 flex gap-2">
        <Link href="/" className="inline-flex h-9 items-center rounded-md bg-foreground px-4 text-[13px] font-medium text-background">
          Command Center
        </Link>
        <Link href="/solutions" className="inline-flex h-9 items-center rounded-md border border-border-strong bg-card px-4 text-[13px] font-medium">
          All solutions
        </Link>
      </div>
    </div>
  );
}

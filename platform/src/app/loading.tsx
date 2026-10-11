export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1680px] px-6 pt-8">
      <div className="h-3 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-4 h-9 w-[46%] animate-pulse rounded bg-muted" />
      <div className="mt-3 h-4 w-[30%] animate-pulse rounded bg-muted" />
      <div className="mt-8 grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[330px_minmax(0,1fr)_370px] gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[520px] animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}

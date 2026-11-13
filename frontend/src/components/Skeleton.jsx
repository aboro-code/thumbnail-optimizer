// Placeholder blocks shown while data loads (PRD §3.3). The pulse respects
// prefers-reduced-motion, and screen readers hear one label instead of shapes.
export function Skeleton({ className = "" }) {
  return <div aria-hidden="true" className={`rounded-md bg-muted motion-safe:animate-pulse ${className}`} />;
}

export function LoadingRegion({ label = "Loading", className = "", children }) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function CardGridSkeleton({ count = 6, label = "Loading thumbnails" }) {
  return (
    <LoadingRegion label={label} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border bg-card">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="flex items-center justify-between gap-2 p-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

export function RowListSkeleton({ count = 4, label = "Loading" }) {
  return (
    <LoadingRegion label={label} className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </LoadingRegion>
  );
}

// Shown instantly while the next screen loads; the navigation stays in place.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-4 pt-4 md:pt-2" aria-busy="true" aria-live="polite">
      <div className="h-9 w-64 max-w-full rounded-full bg-stone-200/70" />
      <div className="h-4 w-40 rounded-full bg-stone-200/60" />
      <div className="grid gap-4 pt-2 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="h-40 rounded-[26px] bg-stone-200/70" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-[20px] bg-surface" />
            ))}
          </div>
          <div className="h-56 rounded-[20px] bg-surface" />
        </div>
        <div className="hidden space-y-4 lg:col-span-2 lg:block">
          <div className="h-40 rounded-[20px] bg-surface" />
          <div className="h-28 rounded-[20px] bg-stone-200/70" />
        </div>
      </div>
    </div>
  );
}

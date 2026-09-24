import type { Business } from "@/lib/types";

export function BusinessHeader({ business }: { business: Business }) {
  const location = [business.address, business.city].filter(Boolean).join(", ");
  return (
    <header className="flex items-center gap-3 border-b border-stone-100 px-4 py-4">
      {business.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={business.logo_url} alt="" className="size-12 rounded-2xl object-cover" />
      ) : (
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-700">{business.name[0]}</div>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold">{business.name}</h1>
        {location && <p className="truncate text-sm text-stone-500">📍 {location}</p>}
      </div>
    </header>
  );
}

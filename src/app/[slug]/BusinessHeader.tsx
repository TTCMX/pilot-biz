import type { Business } from "@/lib/types";
import { Icon } from "@/components/Icon";

/** Calm welcome: logo, the business name in Fraunces, and where to find it. No gradients. */
export function BusinessHeader({ business }: { business: Business }) {
  const location = [business.address, business.city].filter(Boolean).join(", ");
  return (
    <header className="flex items-center gap-4 px-5 pb-6 pt-10 sm:px-6 sm:pt-8">
      {business.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={business.logo_url} alt="" className="size-16 shrink-0 rounded-full bg-surface object-cover" />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-peach font-display text-[28px] font-light text-stone-900">
          {business.name[0]}
        </div>
      )}
      <div className="min-w-0">
        <h1 className="font-display text-[27px] font-light leading-[1.1] text-stone-900">{business.name}</h1>
        {location && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-500">
            <Icon name="place" size={16} />
            <span className="truncate">{location}</span>
          </p>
        )}
      </div>
    </header>
  );
}

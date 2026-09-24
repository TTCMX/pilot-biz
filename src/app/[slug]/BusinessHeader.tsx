import type { Business } from "@/lib/types";
import { Icon } from "@/components/Icon";

export function BusinessHeader({ business }: { business: Business }) {
  const location = [business.address, business.city].filter(Boolean).join(", ");
  return (
    <header className="relative">
      <div className="h-24 bg-gradient-to-br from-brand-100 via-[#c2e7ff] to-[#c4eed0] sm:rounded-t-[28px]" />
      <div className="-mt-10 flex flex-col items-center px-4 pb-5 text-center">
        {business.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logo_url} alt="" className="size-20 rounded-full border-4 border-white bg-white object-cover shadow-card" />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-full border-4 border-white bg-brand-600 text-3xl font-medium text-white shadow-card">
            {business.name[0]}
          </div>
        )}
        <h1 className="mt-3 text-[24px] font-normal leading-tight text-stone-900">{business.name}</h1>
        {location && (
          <p className="mt-1 flex items-center gap-1 text-sm text-stone-500">
            <Icon name="place" size={16} />
            {location}
          </p>
        )}
      </div>
    </header>
  );
}

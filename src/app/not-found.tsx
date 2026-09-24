import Link from "next/link";
import { Icon, Logo } from "@/components/Icon";
import { APP_NAME } from "@/lib/brand";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center">
      <Logo withName={false} />
      <h1 className="text-[56px] font-normal leading-none text-stone-900">404</h1>
      <Link href="/" className="btn-tonal"><Icon name="home" size={18} />{APP_NAME}</Link>
    </main>
  );
}

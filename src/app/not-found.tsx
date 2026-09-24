import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl">🔍</div>
      <h1 className="text-xl font-semibold">404</h1>
      <Link href="/" className="btn-secondary">←</Link>
    </main>
  );
}

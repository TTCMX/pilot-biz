import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirect } from "@/lib/canonical";

const OWNER_PATHS = ["/dashboard", "/calendar", "/customers", "/services", "/staff", "/waitlist", "/settings", "/onboarding"];
// Pages that read or change the session (home redirects signed-in owners to the dashboard).
const SESSION_PATHS = ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/auth"];

// Refreshes the Supabase session cookie and does an optimistic auth redirect.
// Real authorization happens server-side (getContext) and in Postgres (RLS).
export async function proxy(request: NextRequest) {
  const canonical = canonicalRedirect(request.url, {
    method: request.method,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    vercelEnv: process.env.VERCEL_ENV,
  });
  if (canonical) return NextResponse.redirect(canonical, 308);

  let response = NextResponse.next({ request });
  // Public booking pages never use the owner's session: skip the auth work there.
  const path = request.nextUrl.pathname;
  const isOwnerPath = OWNER_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  if (!isOwnerPath && !SESSION_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() refreshes an expiring session and verifies the JWT locally, so
  // navigating between screens doesn't wait on a round trip to Supabase Auth.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub && isOwnerPath) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

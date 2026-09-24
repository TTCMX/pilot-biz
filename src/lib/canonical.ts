// Send production visitors to the canonical domain (e.g. pilot-biz.vercel.app
// or www.adina.pro → adina.pro) so booking links, cookies and emails all use one host.
// Previews and local development are never redirected.

export function canonicalRedirect(
  requestUrl: string,
  opts: { method: string; appUrl: string | undefined; vercelEnv: string | undefined },
): string | null {
  if (opts.vercelEnv !== "production" || !opts.appUrl) return null;
  // Only safe, idempotent requests: redirecting a POST (server action) would drop its body.
  if (opts.method !== "GET" && opts.method !== "HEAD") return null;
  let canonical: URL;
  try {
    canonical = new URL(opts.appUrl);
  } catch {
    return null;
  }
  const current = new URL(requestUrl);
  if (current.host === canonical.host) return null;
  return `${canonical.origin}${current.pathname}${current.search}`;
}

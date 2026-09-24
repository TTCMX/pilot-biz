export const RESERVED_SLUGS = new Set([
  "login", "signup", "auth", "dashboard", "calendar", "customers", "services", "staff", "waitlist", "settings",
  "onboarding", "api", "admin", "app", "www", "help", "about", "pricing", "terms", "privacy", "b", "a", "static", "public",
]);

export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  const slug = base.length >= 3 ? base : `${base || "business"}-${Math.random().toString(36).slice(2, 6)}`;
  return RESERVED_SLUGS.has(slug) ? `${slug}-studio` : slug;
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])$/.test(slug) && !RESERVED_SLUGS.has(slug);
}

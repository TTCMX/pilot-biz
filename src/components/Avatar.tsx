// Warm, botanical tones; the ink is always Bosque for contrast.
const PALETTE = [
  ["#e7c9a9", "#1f2a22"],
  ["#e3e8da", "#1f2a22"],
  ["#dfe7e5", "#1f2a22"],
  ["#efdcc6", "#1f2a22"],
  ["#d6ddcb", "#1f2a22"],
] as const;

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Initials in a soft, name-stable botanical tone. */
export function Avatar({ name, size = 40, color }: { name: string; size?: number; color?: string | null }) {
  const [bg, fg] = PALETTE[hash(name || "?") % PALETTE.length];
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{ width: size, height: size, fontSize: size * 0.4, background: color ?? bg, color: color ? "#fff" : fg }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

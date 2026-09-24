const PALETTE = [
  ["#d3e3fd", "#0842a0"],
  ["#c4eed0", "#0f5223"],
  ["#ffdad6", "#8c1d18"],
  ["#ffefc9", "#5c4300"],
  ["#e9ddff", "#4a2c8a"],
  ["#c2e7ff", "#004a77"],
  ["#ffd8e4", "#7d2946"],
] as const;

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Initials in a soft, name-stable Google tone. */
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

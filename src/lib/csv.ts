// Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF, ; or , delimiters).

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

export type ImportedCustomer = { first_name: string; last_name?: string; email?: string; phone?: string; notes?: string };

const HEADER_ALIASES: Record<keyof ImportedCustomer | "name", string[]> = {
  name: ["name", "nombre", "full name", "nombre completo", "cliente", "customer", "client"],
  first_name: ["first name", "first_name", "firstname", "nombre(s)", "nombres", "given name"],
  last_name: ["last name", "last_name", "lastname", "apellido", "apellidos", "surname", "family name"],
  email: ["email", "e-mail", "correo", "correo electronico", "correo electrónico", "mail"],
  phone: ["phone", "telefono", "teléfono", "tel", "mobile", "celular", "movil", "móvil", "whatsapp", "phone number"],
  notes: ["notes", "notas", "note", "nota", "comments", "comentarios"],
};

/** Map CSV rows to customers using header names in several languages. */
export function mapCustomerRows(rows: string[][]): ImportedCustomer[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const col = (key: keyof typeof HEADER_ALIASES) => headers.findIndex((h) => HEADER_ALIASES[key].includes(h));
  const idx = { name: col("name"), first_name: col("first_name"), last_name: col("last_name"), email: col("email"), phone: col("phone"), notes: col("notes") };
  // No recognizable header: assume name, phone, email.
  const fallback = Object.values(idx).every((i) => i < 0);
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  return rows
    .slice(fallback ? 0 : 1)
    .map((r) => {
      if (fallback) return { first_name: get(r, 0), phone: get(r, 1), email: get(r, 2) };
      let first = get(r, idx.first_name);
      let last = get(r, idx.last_name);
      if (!first && idx.name >= 0) {
        const [f, ...rest] = get(r, idx.name).split(/\s+/);
        first = f ?? "";
        last = last || rest.join(" ");
      }
      return { first_name: first, last_name: last, email: get(r, idx.email), phone: get(r, idx.phone), notes: get(r, idx.notes) };
    })
    .filter((c) => c.first_name);
}

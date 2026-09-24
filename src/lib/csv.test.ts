import { describe, expect, it } from "vitest";
import { mapCustomerRows, parseCsv } from "./csv";
import { slugify } from "./slug";
import { toE164 } from "./phone";

describe("csv import", () => {
  it("parses quoted fields and maps headers in Spanish", () => {
    const rows = parseCsv('Nombre;Teléfono;Correo\n"López, Mariana";55 1234 5678;m@x.com\r\nSofía Pérez;+1 212 555 1234;\n');
    expect(rows).toHaveLength(3);
    const customers = mapCustomerRows(rows);
    expect(customers[0]).toMatchObject({ first_name: "López,", last_name: "Mariana", phone: "55 1234 5678" });
    expect(customers[1]).toMatchObject({ first_name: "Sofía", last_name: "Pérez" });
  });
});

describe("helpers", () => {
  it("slugifies with accents and reserved words", () => {
    expect(slugify("Uñas de Ána")).toBe("unas-de-ana");
    expect(slugify("Login")).toBe("login-studio");
  });
  it("normalizes phones to E.164 per country", () => {
    expect(toE164("55 1234 5678", "MX")).toBe("+525512345678");
    expect(toE164("(212) 555-1234", "US")).toBe("+12125551234");
    expect(toE164("050-123-4567", "IL")).toBe("+972501234567");
    expect(toE164("", "MX")).toBeNull();
  });
});

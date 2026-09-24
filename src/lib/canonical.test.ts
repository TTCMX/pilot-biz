import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "./canonical";

const prod = { method: "GET", appUrl: "https://adina.pro", vercelEnv: "production" };

describe("canonicalRedirect", () => {
  it("moves the vercel.app and www hosts to the canonical domain, keeping path and query", () => {
    expect(canonicalRedirect("https://pilot-biz.vercel.app/unas-ana?service=1", prod)).toBe("https://adina.pro/unas-ana?service=1");
    expect(canonicalRedirect("https://www.adina.pro/login", prod)).toBe("https://adina.pro/login");
  });

  it("leaves the canonical host, previews, local dev and POSTs alone", () => {
    expect(canonicalRedirect("https://adina.pro/dashboard", prod)).toBeNull();
    expect(canonicalRedirect("https://pilot-biz-git-x.vercel.app/", { ...prod, vercelEnv: "preview" })).toBeNull();
    expect(canonicalRedirect("http://localhost:3000/", { ...prod, vercelEnv: undefined })).toBeNull();
    expect(canonicalRedirect("https://pilot-biz.vercel.app/calendar", { ...prod, method: "POST" })).toBeNull();
    expect(canonicalRedirect("https://pilot-biz.vercel.app/", { ...prod, appUrl: undefined })).toBeNull();
  });
});

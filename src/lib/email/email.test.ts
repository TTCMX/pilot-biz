import { afterEach, describe, expect, it, vi } from "vitest";
import { createT } from "@/lib/i18n";
import { customerEmail, ownerEmail } from "./templates";
import { classifyEmailError, emailSender, sendEmail } from "./send";

const data = {
  businessName: "Uñas <Ana>",
  customerName: "Mariana",
  serviceName: "Gel",
  staffName: "Ana",
  when: "jue, 24 sept, 4:00 p.m.",
  price: "$700",
  address: "Roma Norte, CDMX",
  businessPhone: "+52 55 1234 5678",
  link: "https://app.test/unas-ana/a/abc",
};

describe("email templates", () => {
  it("renders a localized, escaped customer confirmation", () => {
    const e = customerEmail("booked", data, createT("es"));
    expect(e.subject).toBe("Reserva confirmada: jue, 24 sept, 4:00 p.m.");
    expect(e.html).toContain("Uñas &lt;Ana&gt;");
    expect(e.html).not.toContain("<Ana>");
    expect(e.html).toContain('href="https://app.test/unas-ana/a/abc"');
    expect(e.text).toContain("Ver, cambiar o cancelar: https://app.test/unas-ana/a/abc");
  });

  it("renders the owner notification in English", () => {
    const e = ownerEmail("new_booking", { ...data, customerPhone: "+52 55", customerEmail: "", notes: "" }, createT("en"));
    expect(e.subject).toBe("New booking: Mariana · jue, 24 sept, 4:00 p.m.");
    expect(e.text).toContain("Phone: +52 55");
    expect(e.text).not.toContain("Email:"); // empty rows are omitted
  });
});

describe("sendEmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does nothing without an API key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail({ to: ["a@b.co"], subject: "s", html: "h", text: "t" })).toEqual({ sent: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Resend with the business as sender name", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Reservas <reservas@midominio.com>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await sendEmail({ to: ["a@b.co", "not-an-email"], subject: "s", html: "h", text: "t", fromName: 'Uñas "Ana"', replyTo: "owner@x.co" });
    expect(r.sent).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: '"Uñas Ana" <reservas@midominio.com>', to: ["a@b.co"], reply_to: "owner@x.co" });
    expect(init.headers.Authorization).toBe("Bearer re_test");
  });

  it("never throws when Resend fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await sendEmail({ to: ["a@b.co"], subject: "s", html: "h", text: "t" })).sent).toBe(false);
    spy.mockRestore();
  });

  it("classifies Resend errors into fixable problems", () => {
    expect(classifyEmailError('403 {"message":"You can only send testing emails to your own email address (you@x.com)."}')).toBe("test_sender");
    expect(classifyEmailError('403 {"message":"The adina.pro domain is not verified. Please, add and verify your domain"}')).toBe("domain");
    expect(classifyEmailError('401 {"message":"API key is invalid"}')).toBe("api_key");
    expect(classifyEmailError('422 {"message":"Invalid `from` field."}')).toBe("from");
    expect(classifyEmailError("500 boom")).toBe("other");
  });

  it("reports whether the Resend test sender is in use", () => {
    vi.stubEnv("EMAIL_FROM", "");
    expect(emailSender()).toEqual({ address: "onboarding@resend.dev", isTestSender: true });
    vi.stubEnv("EMAIL_FROM", "Reservas <reservas@adina.pro>");
    expect(emailSender()).toEqual({ address: "reservas@adina.pro", isTestSender: false });
  });
});

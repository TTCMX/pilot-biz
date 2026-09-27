import { APP_NAME } from "@/lib/brand";

// Transactional email via the Resend HTTP API. Optional: without RESEND_API_KEY
// nothing is sent and the app keeps working exactly the same.

export type EmailMessage = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromName?: string; // shown as the sender, e.g. the business name
  replyTo?: string | null;
};

const DEFAULT_FROM = "onboarding@resend.dev"; // Resend test sender (only delivers to your own Resend account email)

function fromHeader(name: string | undefined): string {
  const configured = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured;
  const configuredName = configured.includes("<") ? configured.slice(0, configured.indexOf("<")).trim().replace(/^"|"$/g, "") : "";
  const display = (name || configuredName || APP_NAME).replace(/["<>\r\n]/g, "").slice(0, 60);
  return `"${display}" <${address}>`;
}

/** The sender address in use, and whether it is Resend's test sender (which only delivers to the Resend account owner). */
export function emailSender(): { address: string; isTestSender: boolean } {
  const configured = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured;
  return { address, isTestSender: address === DEFAULT_FROM };
}

export type EmailProblem = "not_configured" | "test_sender" | "domain" | "api_key" | "from" | "other";

/** Map a Resend error to something the owner can act on. */
export function classifyEmailError(error: string): EmailProblem {
  if (/testing emails|your own email/i.test(error)) return "test_sender";
  if (/domain/i.test(error) && /verif/i.test(error)) return "domain";
  if (/^(401|403)\b/.test(error) && /api key|unauthori[sz]ed|invalid/i.test(error)) return "api_key";
  if (/from/i.test(error) && /^4\d\d/.test(error)) return "from";
  return "other";
}

export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(msg: EmailMessage): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const to = msg.to.filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
  if (!key || !to.length) return { sent: false };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromHeader(msg.fromName),
        to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const error = `${res.status} ${await res.text().catch(() => "")}`.slice(0, 300);
      console.error("[email] send failed", error);
      return { sent: false, error };
    }
    return { sent: true };
  } catch (e) {
    console.error("[email] send failed", e);
    return { sent: false, error: String(e) };
  }
}

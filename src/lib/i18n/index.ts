import { en, type MessageKey } from "./messages/en";
import { es } from "./messages/es";
import type { Language } from "./countries";

export type { MessageKey };
export type Messages = Record<MessageKey, string>;
export type Vars = Record<string, string | number>;

const DICTIONARIES: Record<Language, Messages> = { en, es };

export function getMessages(lang: string | null | undefined): Messages {
  return DICTIONARIES[(lang as Language) in DICTIONARIES ? (lang as Language) : "en"];
}

export function translate(messages: Messages, key: MessageKey, vars?: Vars): string {
  const template = messages[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export type T = (key: MessageKey, vars?: Vars) => string;

export function createT(lang: string | null | undefined): T {
  const messages = getMessages(lang);
  return (key, vars) => translate(messages, key, vars);
}

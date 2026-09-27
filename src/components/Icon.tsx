import {
  AlarmClock, ArrowLeft, Banknote, CalendarCheck2, CalendarDays, CalendarX2, Check, ChevronLeft, ChevronRight, Clock, Copy,
  ExternalLink, FlaskConical, Hourglass, House, Info, Link2, LogOut, Mail, MapPin, MessageCircle, Pencil, Phone, Plus,
  RotateCcw, Scissors, Search, Settings, Sparkles, Star, Trash2, TrendingUp, Upload, User, UserPlus, Users, UsersRound, X,
  type LucideIcon,
} from "lucide-react";
import { APP_NAME } from "@/lib/brand";

// Thin, rounded line icons (Lucide, ISC). They take the current text color.

const ICONS = {
  home: House,
  calendar: CalendarDays,
  group: Users,
  hourglass: Hourglass,
  cut: Scissors,
  team: UsersRound,
  settings: Settings,
  add: Plus,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  close: X,
  check: Check,
  search: Search,
  logout: LogOut,
  openInNew: ExternalLink,
  schedule: Clock,
  money: Banknote,
  eventBusy: CalendarX2,
  eventAvailable: CalendarCheck2,
  person: User,
  personAdd: UserPlus,
  copy: Copy,
  upload: Upload,
  place: MapPin,
  phone: Phone,
  chat: MessageCircle,
  edit: Pencil,
  delete: Trash2,
  back: ArrowLeft,
  replay: RotateCcw,
  mail: Mail,
  star: Star,
  trending: TrendingUp,
  link: Link2,
  sparkle: Sparkles,
  science: FlaskConical,
  alarm: AlarmClock,
  info: Info,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} strokeWidth={1.5} aria-hidden="true" className={`shrink-0 ${className}`} />;
}

/** Brand mark: a sage seed with a fine gold orbit, plus the italic Fraunces logotype. */
export function Logo({ withName = true, className = "" }: { withName?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" width={28} height={28} aria-hidden="true">
        <circle cx="14" cy="17" r="10" fill="#55694F" />
        <circle cx="21" cy="11" r="7" fill="#E7C9A9" />
        <circle cx="21" cy="11" r="9.5" fill="none" stroke="#D9B27C" strokeWidth="1" />
      </svg>
      {withName && <span className="font-display text-[22px] font-light italic leading-none text-stone-900">{APP_NAME}</span>}
    </span>
  );
}

/** Decorative corner shapes for the hero card: a filled peach circle and a fine gold ring. */
export function HeroShapes() {
  return (
    <svg viewBox="0 0 160 160" className="pointer-events-none absolute -right-10 -top-10 size-40" aria-hidden="true">
      <circle cx="96" cy="64" r="46" fill="#E7C9A9" opacity="0.9" />
      <circle cx="64" cy="92" r="44" fill="none" stroke="#D9B27C" strokeWidth="1.2" />
    </svg>
  );
}

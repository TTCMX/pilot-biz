import {
  AlarmClock, ArrowLeft, Banknote, CalendarCheck2, CalendarDays, CalendarX2, Check, ChevronLeft, ChevronRight, Clock, Copy,
  ExternalLink, FlaskConical, Hourglass, House, ImagePlus, Images, Info, Link2, LogOut, Mail, MapPin, MessageCircle, Pencil, Phone, Plus,
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
  camera: ImagePlus,
  gallery: Images,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} strokeWidth={1.5} aria-hidden="true" className={`shrink-0 ${className}`} />;
}

/** Brand mark: a sprout on a Salvia seed — Lino and peach leaves, a small gold sun — plus the italic Fraunces logotype. */
export function Logo({ withName = true, className = "" }: { withName?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" width={30} height={30} aria-hidden="true" className="shrink-0">
        <circle cx="16" cy="16" r="16" fill="#55694F" />
        <path d="M16 26.5V19.5C16 17 16.6 15.2 17.6 13.8" fill="none" stroke="#F6F7F1" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M17.2 14.6C17.2 9.4 20.6 6.4 25.6 6.4C25.6 11.6 22.2 14.6 17.2 14.6Z" fill="#F6F7F1" />
        <path d="M15.4 20.4C15.4 16.2 12.6 13.8 8.4 13.8C8.4 18 11.2 20.4 15.4 20.4Z" fill="#E7C9A9" />
        <circle cx="10" cy="8.5" r="1.8" fill="#D9B27C" />
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

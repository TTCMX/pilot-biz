// Row types mirroring supabase/setup.sql

export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
export type Source = "owner" | "booking_page" | "import";

export type Business = {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  country: string;
  city: string | null;
  currency: string;
  timezone: string;
  locale: string;
  language: string;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  week_start: number;
  solo_mode: boolean;
  slot_interval_minutes: number;
  min_notice_minutes: number;
  max_advance_days: number;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type Staff = {
  id: string;
  business_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  color: string | null;
  active: boolean;
  sort_order: number;
};

export type Service = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price: number;
  currency: string;
  category: string | null;
  active: boolean;
  sort_order: number;
};

export type StaffService = { business_id: string; staff_id: string; service_id: string };

export type Customer = {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source: Source;
  created_at: string;
};

export type CustomerStats = {
  customer_id: string;
  visit_count: number;
  total_spend: number;
  average_ticket: number;
  first_visit: string | null;
  last_visit: string | null;
  next_appointment: string | null;
  cancellation_count: number;
  no_show_count: number;
};

export type Appointment = {
  id: string;
  business_id: string;
  customer_id: string;
  staff_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  price: number;
  currency: string;
  source: Source;
  notes: string | null;
  public_token: string;
  rebooked_from_id: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type WaitlistEntry = {
  id: string;
  business_id: string;
  customer_id: string;
  service_id: string;
  staff_id: string | null;
  preferred_date: string | null;
  preferred_start_time: string | null;
  preferred_end_time: string | null;
  notes: string | null;
  status: "active" | "contacted" | "booked" | "cancelled";
  appointment_id: string | null;
  source: "owner" | "booking_page";
  created_at: string;
};

export const ACTIVE_STATUSES: AppointmentStatus[] = ["scheduled", "confirmed"];
/** Statuses that occupy the calendar (everything except cancelled). */
export const OCCUPYING_STATUSES: AppointmentStatus[] = ["scheduled", "confirmed", "completed", "no_show"];

export function customerName(c: Pick<Customer, "first_name" | "last_name"> | null | undefined): string {
  if (!c) return "";
  return [c.first_name, c.last_name].filter(Boolean).join(" ");
}

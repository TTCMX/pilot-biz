import { DateTime } from "luxon";
import { requireBusiness } from "@/lib/context";
import { todayIn } from "@/lib/i18n/format";
import { CalendarView, type CalendarAppointment } from "./CalendarView";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; staff?: string; new?: string; customer?: string; service?: string; rebook?: string; time?: string }> }) {
  const { business, supabase } = await requireBusiness();
  const sp = await searchParams;
  const tz = business.timezone;
  const date = sp.date && DateTime.fromISO(sp.date, { zone: tz }).isValid ? sp.date : todayIn(tz);
  const view = sp.view === "week" ? "week" : "day";

  const d = DateTime.fromISO(date, { zone: tz });
  const from = view === "week" ? d.minus({ days: (d.weekday - business.week_start + 7) % 7 }) : d;
  const days = view === "week" ? 7 : 1;
  const to = from.plus({ days });

  const [appts, staff, services, staffServices, rules, exceptions] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, customer_id, staff_id, service_id, start_at, end_at, status, price, currency, notes, source, customer:customers(id, first_name, last_name, phone), service:services(name, duration_minutes)")
      .eq("business_id", business.id)
      .gte("start_at", from.toUTC().toISO()!)
      .lt("start_at", to.toUTC().toISO()!)
      .order("start_at"),
    supabase.from("staff").select("id, name, color, active").eq("business_id", business.id).eq("active", true).order("sort_order").order("created_at"),
    supabase.from("services").select("id, name, duration_minutes, price, currency").eq("business_id", business.id).eq("active", true).order("sort_order"),
    supabase.from("staff_services").select("staff_id, service_id").eq("business_id", business.id),
    supabase.from("availability_rules").select("staff_id, day_of_week, start_time, end_time").eq("business_id", business.id),
    supabase.from("availability_exceptions").select("staff_id, date, start_time, end_time, type").eq("business_id", business.id).gte("date", from.toISODate()!).lt("date", to.toISODate()!),
  ]);

  let prefillCustomer = null;
  if (sp.customer) {
    const { data } = await supabase.from("customers").select("id, first_name, last_name, phone, email").eq("id", sp.customer).eq("business_id", business.id).maybeSingle();
    prefillCustomer = data;
  }

  return (
    <CalendarView
      date={date}
      view={view}
      days={Array.from({ length: days }, (_, i) => from.plus({ days: i }).toISODate()!)}
      staffFilter={sp.staff ?? null}
      appointments={(appts.data ?? []) as unknown as CalendarAppointment[]}
      staff={staff.data ?? []}
      services={(services.data ?? []).map((s) => ({ ...s, price: Number(s.price) }))}
      staffServices={staffServices.data ?? []}
      rules={rules.data ?? []}
      exceptions={(exceptions.data ?? []) as never}
      weekStart={business.week_start}
      prefill={sp.new === "1" ? { customer: prefillCustomer, serviceId: sp.service ?? null, staffId: sp.staff ?? null, time: sp.time ?? null, rebookedFromId: sp.rebook ?? null } : null}
    />
  );
}

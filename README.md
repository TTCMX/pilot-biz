# Adina — agenda, reservas y clientes para negocios de citas

Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage). Web responsive, reservas mobile-first, internacional por arquitectura (moneda, zona horaria, idioma, formato y teléfono E.164 por negocio).

➡️ **Para ponerlo en marcha: [SETUP.md](SETUP.md)** (un solo SQL + 4 variables de entorno).

## Qué incluye

| Área | Ruta | Notas |
| --- | --- | --- |
| Registro / login | `/signup`, `/login`, `/forgot-password`, `/reset-password` | Supabase Auth (email + contraseña, recuperación de contraseña) |
| Onboarding | `/onboarding` | Negocio → servicios (plantillas por tipo) → horario → equipo → clientes (CSV) → página lista + reserva de prueba |
| Dashboard | `/dashboard` | Citas de hoy, reservado, espacios libres, cancelaciones, próxima cita, nuevas reservas, ingresos hoy/semana/mes |
| Agenda | `/calendar` | Vista día (columnas por profesional) y semana, crear/editar/mover (drag & drop)/confirmar/completar/no-show/cancelar, rebooking |
| Clientes (CRM) | `/customers`, `/customers/[id]` | Filtros calculados (nuevos, recurrentes, inactivos, VIP), perfil con métricas, historial, ritmo de visitas y mensaje sugerido |
| Lista de espera | `/waitlist` | Coincidencias calculadas por el motor, agendar en un clic, copiar mensaje / abrir WhatsApp (manual) |
| Servicios / Equipo | `/services`, `/staff` | Profesional ↔ servicio, horario semanal, días libres, horarios especiales, cierres del negocio |
| Ajustes | `/settings` | Datos, logo, enlace, país/zona/moneda/idioma, reglas de reserva |
| Página pública | `/{slug}` | Servicio → profesional → fecha/hora → datos → confirmación; sin cuenta |
| Gestión de la reserva | `/{slug}/a/{token}` | Ver, reagendar, cancelar, reservar de nuevo |

## Arquitectura

```
src/lib/booking/engine.ts     Motor de disponibilidad puro y determinista (DST-safe, testeado)
src/lib/booking/service.ts    Acceso a datos + crear/reagendar citas (revalida disponibilidad)
src/lib/booking/waitlist.ts   Coincidencias de lista de espera
src/lib/metrics/*             Segmentos de clientes, ingresos, capacidad (base para Pro / Opportunity Engine)
src/lib/i18n/*                Países, diccionarios (es, en), formateo con Intl
src/app/actions/*             Server actions validadas con zod
supabase/setup.sql            Esquema completo + RLS (aislamiento por business_id)
```

- **Aislamiento de tenants**: RLS en todas las tablas vía `is_business_member(business_id)`.
- **Sin dobles reservas**: restricción `EXCLUDE` en Postgres por profesional + rango de tiempo.
- **Página pública**: nunca usa la anon key contra tablas; pasa por el servidor con la service role key, que valida todo.
- **Anti-spam** (`src/lib/booking/abuse.ts`): campo trampa para bots + límites por negocio: 10 reservas/altas en lista de espera por IP por hora, 3 reservas en línea por teléfono en 24 h, 5 citas futuras en línea por teléfono y 3 altas en lista de espera por teléfono al día. La IP solo se guarda como hash con sal. Sin cambios de esquema.
- **Métricas derivadas** (visitas, gasto, ticket, última/próxima cita) en la vista `customer_stats`, no duplicadas.
- **Mensajes**: solo sugeridos; la dueña los copia o abre WhatsApp manualmente.
- **Correos** (opcional, Resend): confirmación/cambio/cancelación a la clienta y avisos a la dueña, enviados después de responder (`after()`), así nunca frenan ni rompen una reserva.

## Idiomas

`src/lib/i18n/messages/en.ts` es la fuente de claves; `es.ts` está tipado contra ella (falta una clave → error de compilación). Para agregar un idioma: nuevo archivo + entrada en `SUPPORTED_LANGUAGES`.
